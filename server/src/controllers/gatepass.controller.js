/**
 * GatePass — the approval authority's endpoints.
 *
 * Scoping rule that runs through every handler here: an AUTHORITY only ever
 * sees rows where `authority_id = req.user.id`. A miss answers 404 rather than
 * 403 so ids belonging to other hosts are not enumerable. ADMIN sees everything.
 */
import { pool, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { env } from '../config/env.js';
import { GATEPASS_SELECT, serializeGatepass, serializeMany } from '../services/gatepassSerializer.js';
import { assertNoConflict, assertValidSlot, lockRoom } from '../services/booking.js';
import { logActivity, logActivityTx } from '../services/activity.js';
import { safeSend } from '../services/mailer.js';
import * as templates from '../services/templates.js';
import { icsAttachment } from '../utils/ics.js';
import {
  signGatepassToken,
  signRescheduleToken,
  makeShortCode,
  renderQrBuffer,
} from '../utils/qr.js';
import { formatDateHuman, formatRangeHuman, todayInOrgTz } from '../utils/time.js';

const MAX_PAGE_SIZE = 100;

const SORTS = {
  created_desc: 'g.created_at DESC, g.id DESC',
  created_asc: 'g.created_at ASC, g.id ASC',
  date_asc: 'g.requested_date ASC, g.start_time ASC, g.id ASC',
  date_desc: 'g.requested_date DESC, g.start_time DESC, g.id DESC',
};

/** Loads one gatepass through the canonical projection, honouring scope. */
async function loadScoped(id, user, client) {
  const runner = client && typeof client.query === 'function' ? client : pool;
  const params = [id];
  let sql = `${GATEPASS_SELECT} WHERE g.id = $1`;
  if (user.role === 'AUTHORITY') {
    params.push(user.id);
    sql += ' AND g.authority_id = $2';
  }
  const { rows } = await runner.query(sql, params);
  if (!rows[0]) throw ApiError.notFound('That visitor request could not be found.');
  return rows[0];
}

/** Re-reads a row inside a transaction with a write lock held on it. */
async function loadForUpdate(client, id, user) {
  const params = [id];
  let sql = 'SELECT * FROM gatepass_requests WHERE id = $1';
  if (user.role === 'AUTHORITY') {
    params.push(user.id);
    sql += ' AND authority_id = $2';
  }
  const { rows } = await client.query(`${sql} FOR UPDATE`, params);
  if (!rows[0]) throw ApiError.notFound('That visitor request could not be found.');
  return rows[0];
}

/** Reloads and serializes after a mutation so responses are always canonical. */
async function reload(id, user, options) {
  return serializeGatepass(await loadScoped(id, user), options);
}

/**
 * The shared list query behind both `/api/gatepasses` and `/api/admin/gatepasses`.
 * Exported so the admin controller reuses the exact same filtering and paging.
 *
 * @param {{user: object, query: object, unscoped?: boolean}} args
 */
export async function listGatepassesQuery({ user, query: q = {}, unscoped = false }) {
  const where = [];
  const params = [];
  /** Binds a value and returns its placeholder, so filters stay parameterised. */
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!unscoped && user.role === 'AUTHORITY') {
    where.push(`g.authority_id = ${push(user.id)}`);
  }
  if (q.status) where.push(`g.status = ${push(q.status)}::gatepass_status`);
  if (q.date) where.push(`g.requested_date = ${push(q.date)}`);
  if (q.from) where.push(`g.requested_date >= ${push(q.from)}`);
  if (q.to) where.push(`g.requested_date <= ${push(q.to)}`);
  if (q.room_id) where.push(`g.room_id = ${push(q.room_id)}`);
  if (q.authority_id) where.push(`g.authority_id = ${push(q.authority_id)}`);
  if (q.q) {
    const like = `%${q.q}%`;
    const p = push(like);
    where.push(
      `(g.visitor_name ILIKE ${p} OR g.visitor_company ILIKE ${p} OR g.visitor_mobile ILIKE ${p} OR g.visitor_email ILIKE ${p})`
    );
  }

  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 20));
  const orderBy = SORTS[q.sort] || SORTS.created_desc;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limitParam = push(pageSize);
  const offsetParam = push((page - 1) * pageSize);

  const { rows } = await pool.query(
    `${GATEPASS_SELECT} ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total
       FROM gatepass_requests g
       JOIN users u ON u.id = g.authority_id
       ${whereSql}`,
    countParams
  );

  // Same trust boundary as getOne(): an AUTHORITY only ever sees their own
  // requests here (scoped above), and ADMIN already sees everything else
  // about every request — the QR token adds no new exposure for either.
  return { items: serializeMany(rows, { includeQr: true }), total: countRows[0].total, page, pageSize };
}

// --- read -------------------------------------------------------------------

export async function list(req, res) {
  res.json(await listGatepassesQuery({ user: req.user, query: req.query }));
}

export async function getOne(req, res) {
  const row = await loadScoped(Number(req.params.id), req.user);
  res.json(serializeGatepass(row, { includeQr: true }));
}

export async function stats(req, res) {
  const scoped = req.user.role === 'AUTHORITY';
  const params = scoped ? [req.user.id, todayInOrgTz()] : [todayInOrgTz()];
  const scopeSql = scoped ? 'WHERE g.authority_id = $1' : '';
  const today = scoped ? '$2' : '$1';

  const { rows } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE g.status = 'PENDING')::int  AS pending,
       count(*) FILTER (WHERE g.status = 'REJECTED')::int AS rejected,
       count(*) FILTER (WHERE g.status = 'RESCHEDULE_REQUESTED')::int AS reschedule_requested,
       count(*) FILTER (WHERE g.status = 'APPROVED' AND g.requested_date = ${today})::int AS approved_today,
       count(*) FILTER (WHERE g.check_in_time IS NOT NULL AND g.check_out_time IS NULL)::int AS checked_in,
       count(*) FILTER (WHERE g.requested_date = ${today} AND (g.check_out_time IS NOT NULL
             OR ml.status IN ('COMPLETED','EARLY_CLOSED')))::int AS completed_today,
       count(*)::int AS total
     FROM gatepass_requests g
     LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
     ${scopeSql}`,
    params
  );
  res.json(rows[0]);
}

// --- approve ----------------------------------------------------------------

/** Generates a short code, retrying the vanishingly rare unique collision. */
async function claimShortCode(client, gatepassId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeShortCode(8);
    const { rows } = await client.query(
      'SELECT 1 FROM gatepass_requests WHERE qr_short_code = $1 AND id <> $2',
      [code, gatepassId]
    );
    if (rows.length === 0) return code;
  }
  throw ApiError.internal('Could not allocate a unique gate pass code. Please retry.');
}

export async function approve(req, res) {
  const id = Number(req.params.id);
  const { room_id: roomId, comment } = req.body;

  const result = await withTransaction(async (client) => {
    const room = await lockRoom(client, roomId);
    const gatepass = await loadForUpdate(client, id, req.user);

    if (!['PENDING', 'RESCHEDULE_REQUESTED'].includes(gatepass.status)) {
      throw ApiError.conflict(
        `This request is already ${gatepass.status.toLowerCase().replace(/_/g, ' ')} and cannot be approved again.`
      );
    }

    assertValidSlot(gatepass);
    await assertNoConflict(client, {
      roomId,
      date: gatepass.requested_date,
      startTime: gatepass.start_time,
      endTime: gatepass.end_time,
      excludeGatepassId: id,
    });

    const shortCode = gatepass.qr_short_code || (await claimShortCode(client, id));
    const token = signGatepassToken(id);

    await client.query(
      `UPDATE gatepass_requests
          SET room_id = $1,
              status = 'APPROVED',
              approved_at = now(),
              approved_by = $2,
              qr_code_hash = $3,
              qr_short_code = $4,
              reschedule_token = NULL,
              authority_comment = COALESCE($5, authority_comment),
              updated_at = now()
        WHERE id = $6`,
      [roomId, req.user.id, token, shortCode, comment ?? null, id]
    );

    await client.query(
      `INSERT INTO meeting_logs (gatepass_id, status)
            VALUES ($1, 'SCHEDULED')
       ON CONFLICT (gatepass_id) DO UPDATE
            SET status = 'SCHEDULED', actual_end = NULL, updated_at = now()`,
      [id]
    );

    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_APPROVED',
      entityType: 'gatepass',
      entityId: id,
      meta: { room_id: roomId, room_name: room.name },
      ip: req.ip,
    });

    return { room };
  });

  const gatepass = await reload(id, req.user, { includeQr: true });
  res.json(gatepass);
  void dispatchApprovalEmails(gatepass, result.room, apiBaseUrl(req));
}

/**
 * The origin this request actually arrived on. Used to build a QR image URL
 * that resolves correctly wherever the API is really being reached from,
 * without a separate "public API URL" setting to keep in sync.
 */
function apiBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * Renders the QR, builds the invite and mails both parties. Never throws.
 *
 * The QR reaches the visitor two ways, because no single method survives
 * every mail client: as a real PNG **attachment** (opens regardless of any
 * inline-image policy) and as an `<img>` pointed at `qrImage()` below over a
 * real URL (the one inline-embedding method Gmail and Outlook actually
 * render — they both strip `data:` URIs, which is what this used to send).
 */
async function dispatchApprovalEmails(gatepass, room, baseUrl) {
  try {
    const qrPng = await renderQrBuffer(gatepass.qr_code_hash);
    const qrImageUrl = `${baseUrl}/api/gatepasses/${gatepass.id}/qr.png?token=${encodeURIComponent(gatepass.qr_code_hash)}`;
    const invite = icsAttachment({ gatepass, room });
    const attachments = [
      { name: `gatepass-qr-${gatepass.id}.png`, contentBase64: qrPng.toString('base64') },
      ...(invite ? [invite] : []),
    ];
    const authority = {
      name: gatepass.authority_name,
      email: gatepass.authority_email,
      mobile: gatepass.authority_mobile,
    };

    await safeSend({
      to: [{ email: gatepass.visitor_email, name: gatepass.visitor_name }],
      attachments,
      ...templates.approvedToVisitor({ gatepass, qrImageUrl, room, authority }),
    });
    await safeSend({
      to: [{ email: gatepass.authority_email, name: gatepass.authority_name }],
      attachments,
      ...templates.approvedToAuthority({
        gatepass,
        room,
        visitor: { name: gatepass.visitor_name, email: gatepass.visitor_email },
      }),
    });
  } catch (err) {
    console.warn('[gatepass] approval email failed:', err.message);
  }
}

// --- reject / reschedule / comment -------------------------------------------

export async function reject(req, res) {
  const id = Number(req.params.id);
  const { comment } = req.body;

  await withTransaction(async (client) => {
    const gatepass = await loadForUpdate(client, id, req.user);
    if (gatepass.status === 'REJECTED') {
      throw ApiError.conflict('This request has already been rejected.');
    }
    await client.query(
      `UPDATE gatepass_requests
          SET status = 'REJECTED', authority_comment = $1, room_id = NULL,
              qr_code_hash = NULL, qr_short_code = NULL, updated_at = now()
        WHERE id = $2`,
      [comment, id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_REJECTED',
      entityType: 'gatepass',
      entityId: id,
      meta: { comment },
      ip: req.ip,
    });
  });

  const gatepass = await reload(id, req.user);
  res.json(gatepass);
  void safeSend({
    to: [{ email: gatepass.visitor_email, name: gatepass.visitor_name }],
    ...templates.rejectedToVisitor({
      gatepass,
      comment,
      authority: { name: gatepass.authority_name, email: gatepass.authority_email },
    }),
  });
}

export async function requestReschedule(req, res) {
  const id = Number(req.params.id);
  const { comment, suggested_date: sd, suggested_start: ss, suggested_end: se } = req.body;

  let note = comment;
  if (sd || ss || se) {
    const parts = [];
    if (sd) parts.push(formatDateHuman(sd));
    if (ss && se) parts.push(formatRangeHuman(ss, se));
    else if (ss) parts.push(`from ${ss}`);
    if (parts.length) note = `${comment}\n\nSuggested instead: ${parts.join(', ')}`;
  }

  const token = signRescheduleToken(id);

  await withTransaction(async (client) => {
    const gatepass = await loadForUpdate(client, id, req.user);
    if (gatepass.status === 'REJECTED') {
      throw ApiError.conflict('A rejected request cannot be rescheduled.');
    }
    await client.query(
      `UPDATE gatepass_requests
          SET status = 'RESCHEDULE_REQUESTED', authority_comment = $1,
              room_id = NULL, qr_code_hash = NULL, qr_short_code = NULL,
              reschedule_token = $2, reminder_sent_at = NULL, updated_at = now()
        WHERE id = $3`,
      [note, token, id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_RESCHEDULE_REQUESTED',
      entityType: 'gatepass',
      entityId: id,
      meta: { comment: note },
      ip: req.ip,
    });
  });

  const gatepass = await reload(id, req.user);
  res.json(gatepass);
  void safeSend({
    to: [{ email: gatepass.visitor_email, name: gatepass.visitor_name }],
    ...templates.rescheduleToVisitor({
      gatepass,
      comment: note,
      rescheduleUrl: `${env.APP_URL}/reschedule/${token}`,
      authority: { name: gatepass.authority_name, email: gatepass.authority_email },
    }),
  });
}

export async function addComment(req, res) {
  const id = Number(req.params.id);
  const { comment } = req.body;

  await withTransaction(async (client) => {
    const gatepass = await loadForUpdate(client, id, req.user);
    const merged = gatepass.authority_comment
      ? `${gatepass.authority_comment}\n\n${comment}`
      : comment;
    await client.query(
      'UPDATE gatepass_requests SET authority_comment = $1, updated_at = now() WHERE id = $2',
      [merged, id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_COMMENTED',
      entityType: 'gatepass',
      entityId: id,
      meta: { comment },
      ip: req.ip,
    });
  });

  res.json(await reload(id, req.user));
}

// --- room switch / early close ------------------------------------------------

export async function switchRoom(req, res) {
  const id = Number(req.params.id);
  const { room_id: roomId } = req.body;

  const { oldRoom, newRoom } = await withTransaction(async (client) => {
    const room = await lockRoom(client, roomId);
    const gatepass = await loadForUpdate(client, id, req.user);

    if (gatepass.status !== 'APPROVED') {
      throw ApiError.conflict('Only an approved request can have its room changed.');
    }
    if (gatepass.check_in_time) {
      throw ApiError.conflict('The visitor has already checked in — the room can no longer be changed.');
    }
    const { rows: logRows } = await client.query(
      'SELECT status FROM meeting_logs WHERE gatepass_id = $1',
      [id]
    );
    const logStatus = logRows[0]?.status || 'SCHEDULED';
    if (logStatus !== 'SCHEDULED') {
      throw ApiError.conflict(
        `This meeting is ${logStatus.toLowerCase().replace(/_/g, ' ')} — the room can no longer be changed.`
      );
    }
    if (gatepass.room_id === roomId) {
      throw ApiError.conflict(`This meeting is already booked into ${room.name}.`);
    }

    await assertNoConflict(client, {
      roomId,
      date: gatepass.requested_date,
      startTime: gatepass.start_time,
      endTime: gatepass.end_time,
      excludeGatepassId: id,
    });

    let previous = null;
    if (gatepass.room_id) {
      const { rows } = await client.query('SELECT * FROM meeting_rooms WHERE id = $1', [gatepass.room_id]);
      previous = rows[0] || null;
    }

    await client.query(
      'UPDATE gatepass_requests SET room_id = $1, updated_at = now() WHERE id = $2',
      [roomId, id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_ROOM_SWITCHED',
      entityType: 'gatepass',
      entityId: id,
      meta: { from: previous?.name ?? null, to: room.name },
      ip: req.ip,
    });

    return { oldRoom: previous, newRoom: room };
  });

  const gatepass = await reload(id, req.user, { includeQr: true });
  res.json(gatepass);

  const mail = templates.roomSwitchedNotice({ gatepass, oldRoom, newRoom });
  void safeSend({ to: [{ email: gatepass.visitor_email, name: gatepass.visitor_name }], ...mail });
  void safeSend({ to: [{ email: gatepass.authority_email, name: gatepass.authority_name }], ...mail });
}

export async function closeEarly(req, res) {
  const id = Number(req.params.id);

  await withTransaction(async (client) => {
    const gatepass = await loadForUpdate(client, id, req.user);
    if (gatepass.status !== 'APPROVED') {
      throw ApiError.conflict('Only an approved meeting can be closed early.');
    }
    const { rows } = await client.query(
      'SELECT status FROM meeting_logs WHERE gatepass_id = $1 FOR UPDATE',
      [id]
    );
    const logStatus = rows[0]?.status;
    if (logStatus === 'COMPLETED' || logStatus === 'EARLY_CLOSED') {
      throw ApiError.conflict('This meeting has already finished.');
    }

    await client.query(
      'UPDATE gatepass_requests SET is_closed_early = TRUE, updated_at = now() WHERE id = $1',
      [id]
    );
    await client.query(
      `INSERT INTO meeting_logs (gatepass_id, actual_start, actual_end, status)
            VALUES ($1, now(), now(), 'EARLY_CLOSED')
       ON CONFLICT (gatepass_id) DO UPDATE
            SET actual_start = COALESCE(meeting_logs.actual_start, now()),
                actual_end = now(),
                status = 'EARLY_CLOSED',
                updated_at = now()`,
      [id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'GATEPASS_CLOSED_EARLY',
      entityType: 'gatepass',
      entityId: id,
      ip: req.ip,
    });
  });

  const gatepass = await reload(id, req.user, { includeQr: true });
  res.json(gatepass);
  void safeSend({
    to: [{ email: gatepass.authority_email, name: gatepass.authority_name }],
    ...templates.meetingClosedEarly({ gatepass }),
  });
}

// --- resend -------------------------------------------------------------------

export async function resendEmail(req, res) {
  const id = Number(req.params.id);
  const row = await loadScoped(id, req.user);
  if (row.status !== 'APPROVED') {
    throw ApiError.conflict('Only an approved gate pass can be re-sent.');
  }
  const gatepass = serializeGatepass(row, { includeQr: true });
  const room = row.room_id
    ? {
        id: row.room_id,
        name: row.room_name,
        building: row.room_building,
        floor: row.room_floor,
        capacity: row.room_capacity,
      }
    : null;

  logActivity({
    userId: req.user.id,
    action: 'GATEPASS_EMAIL_RESENT',
    entityType: 'gatepass',
    entityId: id,
    ip: req.ip,
  });

  res.json({ ok: true });
  void dispatchApprovalEmails(gatepass, room, apiBaseUrl(req));
}

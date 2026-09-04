/**
 * GatePass — endpoints a visitor reaches without an account.
 *
 * Everything here is deliberately thin on what it returns: the reschedule view
 * is a limited projection, because its only credential is a link in an inbox.
 */
import { pool, query, withTransaction } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { env } from '../config/env.js';
import { GATEPASS_SELECT, serializeGatepass } from '../services/gatepassSerializer.js';
import { assertValidSlot } from '../services/booking.js';
import { logActivity } from '../services/activity.js';
import { safeSend } from '../services/mailer.js';
import * as templates from '../services/templates.js';
import { verifyRescheduleToken, renderQrBuffer, scanUrl } from '../utils/qr.js';
import { normalizeTime, toDateOnly } from '../utils/time.js';

/** The hosts a visitor may choose from. */
export async function authorities(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, email, department, designation
       FROM users
      WHERE role = 'AUTHORITY' AND is_active = TRUE
      ORDER BY name`
  );
  res.json(rows);
}

/** Informational only — a visitor does not pick their own room. */
export async function rooms(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, building, floor, capacity
       FROM meeting_rooms
      WHERE is_active = TRUE
      ORDER BY building NULLS FIRST, floor NULLS FIRST, name`
  );
  res.json(rows);
}

/** Workflow A — the visitor submits a request. */
export async function createRequest(req, res) {
  const body = req.body;

  const { rows: hostRows } = await pool.query(
    `SELECT id, name, email, mobile, department
       FROM users
      WHERE id = $1 AND role = 'AUTHORITY' AND is_active = TRUE`,
    [body.authority_id]
  );
  const authority = hostRows[0];
  if (!authority) {
    throw ApiError.notFound('That host is not available for meeting requests.');
  }

  assertValidSlot(body);

  const { rows } = await pool.query(
    `INSERT INTO gatepass_requests
       (visitor_name, visitor_company, visitor_designation, visitor_mobile,
        visitor_whatsapp, visitor_email, authority_id, reason,
        requested_date, start_time, end_time, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'PENDING')
     RETURNING id, status, requested_date, start_time, end_time, visitor_name`,
    [
      body.visitor_name,
      body.visitor_company ?? null,
      body.visitor_designation ?? null,
      body.visitor_mobile,
      body.visitor_whatsapp ?? null,
      body.visitor_email,
      body.authority_id,
      body.reason,
      body.requested_date,
      body.start_time,
      body.end_time,
    ]
  );

  const created = rows[0];

  logActivity({
    userId: null,
    actorLabel: 'Visitor (public)',
    action: 'GATEPASS_REQUESTED',
    entityType: 'gatepass',
    entityId: created.id,
    meta: { visitor_name: created.visitor_name, authority_id: authority.id },
    ip: req.ip,
  });

  res.status(201).json({
    id: created.id,
    status: created.status,
    message: `Your request has been sent to ${authority.name}. You will receive an email once it is reviewed.`,
    visitor_name: created.visitor_name,
    requested_date: toDateOnly(created.requested_date),
    start_time: normalizeTime(created.start_time),
    end_time: normalizeTime(created.end_time),
    authority_name: authority.name,
  });

  const { rows: fullRows } = await pool.query(`${GATEPASS_SELECT} WHERE g.id = $1`, [created.id]);
  const gatepass = serializeGatepass(fullRows[0]);
  void safeSend({
    to: [{ email: authority.email, name: authority.name }],
    ...templates.newRequestToAuthority({
      gatepass,
      authority,
      actionUrl: `${env.APP_URL}/authority/requests/${created.id}`,
    }),
  });
}

/** Resolves a reschedule link, or explains why it no longer works. */
async function resolveRescheduleToken(token) {
  const { gid } = verifyRescheduleToken(token);
  const { rows } = await pool.query(`${GATEPASS_SELECT} WHERE g.id = $1`, [gid]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('That visitor request no longer exists.');
  if (row.status !== 'RESCHEDULE_REQUESTED' || row.reschedule_token !== token) {
    throw ApiError.conflict('This reschedule link has already been used or is no longer active.');
  }
  return row;
}

/** The limited projection a link-holder is allowed to see. */
function publicView(row) {
  return {
    id: row.id,
    visitor_name: row.visitor_name,
    reason: row.reason,
    requested_date: toDateOnly(row.requested_date),
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    authority_name: row.authority_name,
    status: row.status,
  };
}

export async function getReschedule(req, res) {
  const row = await resolveRescheduleToken(req.params.token);
  res.json({ gatepass: publicView(row), authority_comment: row.authority_comment ?? null });
}

export async function submitReschedule(req, res) {
  const token = req.params.token;
  const body = req.body;
  assertValidSlot(body);

  const id = await withTransaction(async (client) => {
    const row = await resolveRescheduleToken(token);
    const { rows } = await client.query(
      `UPDATE gatepass_requests
          SET requested_date = $1, start_time = $2, end_time = $3,
              status = 'PENDING', reschedule_token = NULL,
              reminder_sent_at = NULL, updated_at = now()
        WHERE id = $4 AND reschedule_token = $5
        RETURNING id`,
      [body.requested_date, body.start_time, body.end_time, row.id, token]
    );
    if (!rows[0]) {
      throw ApiError.conflict('This reschedule link has already been used.');
    }
    return rows[0].id;
  });

  logActivity({
    userId: null,
    actorLabel: 'Visitor (public)',
    action: 'GATEPASS_RESCHEDULED_BY_VISITOR',
    entityType: 'gatepass',
    entityId: id,
    meta: { requested_date: body.requested_date, start_time: body.start_time },
    ip: req.ip,
  });

  const { rows } = await pool.query(`${GATEPASS_SELECT} WHERE g.id = $1`, [id]);
  const gatepass = serializeGatepass(rows[0]);

  res.json({ ok: true, gatepass: publicView(rows[0]) });

  void safeSend({
    to: [{ email: gatepass.authority_email, name: gatepass.authority_name }],
    ...templates.visitorRescheduledToAuthority({
      gatepass,
      actionUrl: `${env.APP_URL}/authority/requests/${id}`,
    }),
  });
}

/**
 * Serves the gate pass QR as a real image over HTTP, so email templates can
 * reference it with a normal `<img src="https://.../qr.png?token=...">`.
 *
 * This exists because Gmail and Outlook both strip `data:` URIs out of HTML
 * email — an inline base64 image never renders there. A URL an email client
 * fetches over the network is the one embedding method every major webmail
 * client actually supports. `token` is the gate pass's own signed QR token
 * (the same secret printed in the QR code itself), so this reveals nothing a
 * holder of the email couldn't already get by scanning the code; it is
 * intentionally unauthenticated because a remote mail client fetching an
 * inline image cannot present a login session.
 */
export async function qrImage(req, res) {
  const id = Number(req.params.id);
  const token = String(req.query.token || '');

  const { rows } = await pool.query(
    'SELECT qr_code_hash, status FROM gatepass_requests WHERE id = $1',
    [id]
  );
  const row = rows[0];
  const valid = row && row.status === 'APPROVED' && row.qr_code_hash && row.qr_code_hash === token;

  if (!valid) {
    // No details leaked either way — same 404 whether the id doesn't exist,
    // the token is wrong, or the pass has since been rejected/rescheduled
    // (which clears qr_code_hash). A broken-image icon in an old email is the
    // correct outcome once a pass is no longer valid.
    res.status(404).end();
    return;
  }

  const png = await renderQrBuffer(scanUrl(token));
  res.set({
    'Content-Type': 'image/png',
    // The pairing of an id with its qr_code_hash never changes meaning once
    // issued (a re-approval mints a new token, so the URL changes with it) —
    // safe to cache hard, including in the recipient's mail client.
    'Cache-Control': 'public, max-age=31536000, immutable',
    // helmet's default Cross-Origin-Resource-Policy is 'same-origin', which
    // blocks a cross-origin <img src> from loading this at all — invisible in
    // local dev (Vite's proxy makes the request same-origin to the browser),
    // but breaks every deployment where the client and API are on different
    // origins (e.g. Vercel + Render). This route exists specifically to be
    // embedded from anywhere an unauthenticated <img> can point at it — mail
    // clients, and now our own separately-hosted frontend — so it opts out.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(png);
}

/** Liveness probe. Reports rather than throws when the database is unreachable. */
export async function health(req, res) {
  let db = false;
  try {
    await query('SELECT 1');
    db = true;
  } catch {
    db = false;
  }
  res.json({ ok: true, db, time: new Date().toISOString(), env: env.NODE_ENV });
}

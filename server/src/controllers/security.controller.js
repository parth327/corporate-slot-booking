/**
 * GatePass — the security desk: verify a pass, then check the visitor in and out.
 *
 * A pass for the wrong day, or presented outside its window, is still *valid* —
 * it just comes back with the relevant `checks` flag false so the guard sees a
 * warning and can use their judgement. Only an unknown or unapproved pass fails.
 */
import { pool, withTransaction } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { GATEPASS_SELECT, serializeGatepass, serializeMany } from '../services/gatepassSerializer.js';
import { logActivity, logActivityTx } from '../services/activity.js';
import { verifyGatepassToken } from '../utils/qr.js';
import {
  todayInOrgTz,
  orgNow,
  combineToInstant,
  addMinutes,
  formatTimeHuman,
  normalizeTime,
} from '../utils/time.js';

/** How far either side of the booking a pass still scans as "in window". */
const EARLY_GRACE_MIN = 60;
const LATE_GRACE_MIN = 120;

async function loadById(id) {
  const { rows } = await pool.query(`${GATEPASS_SELECT} WHERE g.id = $1`, [id]);
  return rows[0] || null;
}

/** The advisory flags the guard UI turns into warning chips. */
function buildChecks(row) {
  const today = todayInOrgTz();
  const date = row.requested_date instanceof Date ? row.requested_date : String(row.requested_date);
  const dateStr = typeof date === 'string' ? date.slice(0, 10) : today;

  const now = new Date();
  const opens = addMinutes(combineToInstant(dateStr, normalizeTime(row.start_time)), -EARLY_GRACE_MIN);
  const closes = addMinutes(combineToInstant(dateStr, normalizeTime(row.end_time)), LATE_GRACE_MIN);

  return {
    is_today: dateStr === today,
    within_window: now >= opens && now <= closes,
    already_checked_in: Boolean(row.check_in_time),
    already_checked_out: Boolean(row.check_out_time),
  };
}

export async function verify(req, res) {
  const { token, short_code: shortCode } = req.body;
  if (!token && !shortCode) {
    throw ApiError.badRequest('Validation failed', {
      fields: { token: 'either a QR token or a short code is required' },
    });
  }

  let row = null;

  if (token) {
    const { gid } = verifyGatepassToken(token);
    row = await loadById(gid);
    // A regenerated pass must invalidate the one printed before it.
    if (row && row.qr_code_hash !== token) {
      throw ApiError.invalidQr('This gate pass has been reissued. Ask the visitor for the latest one.');
    }
  } else {
    const { rows } = await pool.query(
      `${GATEPASS_SELECT} WHERE upper(g.qr_short_code) = upper($1)`,
      [String(shortCode).trim()]
    );
    row = rows[0] || null;
  }

  if (!row) throw ApiError.invalidQr('Unrecognised gate pass. Please check the code and try again.');
  if (row.status !== 'APPROVED') {
    throw ApiError.invalidQr('This gate pass is not approved and cannot be used for entry.');
  }

  logActivity({
    userId: req.user.id,
    action: 'GATEPASS_SCANNED',
    entityType: 'gatepass',
    entityId: row.id,
    meta: { method: token ? 'qr' : 'short_code' },
    ip: req.ip,
  });

  res.json({ valid: true, gatepass: serializeGatepass(row), checks: buildChecks(row) });
}

export async function search(req, res) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    throw ApiError.badRequest('Validation failed', {
      fields: { q: 'enter at least 2 characters' },
    });
  }

  const digits = q.replace(/\D/g, '');
  const { rows } = await pool.query(
    `${GATEPASS_SELECT}
      WHERE g.status = 'APPROVED'
        AND g.requested_date BETWEEN ($1::date - INTERVAL '1 day') AND ($1::date + INTERVAL '1 day')
        AND (g.visitor_name ILIKE $2
             OR ($3 <> '' AND regexp_replace(g.visitor_mobile, '\\D', '', 'g') LIKE $4))
      ORDER BY g.requested_date, g.start_time
      LIMIT 25`,
    [todayInOrgTz(), `%${q}%`, digits, `%${digits}%`]
  );

  res.json({ items: serializeMany(rows) });
}

export async function today(req, res) {
  const { rows } = await pool.query(
    `${GATEPASS_SELECT}
      WHERE g.status = 'APPROVED' AND g.requested_date = $1
      ORDER BY g.start_time`,
    [todayInOrgTz()]
  );
  const items = serializeMany(rows);

  const expected = items.filter((g) => !g.check_in_time);
  const onPremises = items.filter((g) => g.check_in_time && !g.check_out_time);
  const departed = items.filter((g) => g.check_out_time);

  res.json({
    expected,
    on_premises: onPremises,
    departed,
    stats: {
      expected: expected.length,
      on_premises: onPremises.length,
      departed: departed.length,
      total: items.length,
    },
  });
}

/** 'YYYY-MM-DD' `days` calendar days before `dateStr`, in the org's calendar (no timezone math needed for pure date arithmetic). */
function daysBeforeDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Datewise scan/departure counts for the trailing window — the guard desk's activity history. */
export async function history(req, res) {
  const days = Math.min(60, Math.max(1, Number(req.query.days) || 14));
  const today = todayInOrgTz();
  const from = daysBeforeDateStr(today, days - 1);

  const { rows } = await pool.query(
    `SELECT g.requested_date::text AS date,
            COUNT(*)                                                   AS approved,
            COUNT(*) FILTER (WHERE g.check_in_time IS NOT NULL)  AS scanned,
            COUNT(*) FILTER (WHERE g.check_out_time IS NOT NULL) AS departed
       FROM gatepass_requests g
      WHERE g.status = 'APPROVED'
        AND g.requested_date BETWEEN $1 AND $2
      GROUP BY g.requested_date
      ORDER BY g.requested_date DESC`,
    [from, today]
  );

  res.json({ from, to: today, items: rows });
}

export async function getOne(req, res) {
  const row = await loadById(Number(req.params.id));
  if (!row) throw ApiError.notFound('That gate pass could not be found.');
  res.json(serializeGatepass(row));
}

export async function checkIn(req, res) {
  const id = Number(req.params.id);

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM gatepass_requests WHERE id = $1 FOR UPDATE',
      [id]
    );
    const row = rows[0];
    if (!row) throw ApiError.notFound('That gate pass could not be found.');
    if (row.status !== 'APPROVED') {
      throw ApiError.conflict('This gate pass is not approved, so the visitor cannot be admitted.');
    }
    if (row.check_out_time) {
      throw ApiError.conflict('This visitor has already checked out for this meeting.');
    }
    if (row.check_in_time) {
      const at = new Date(row.check_in_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      throw ApiError.conflict(`Visitor already checked in at ${at}.`);
    }

    await client.query(
      'UPDATE gatepass_requests SET check_in_time = now(), updated_at = now() WHERE id = $1',
      [id]
    );
    await client.query(
      `INSERT INTO meeting_logs (gatepass_id, actual_start, status)
            VALUES ($1, now(), 'IN_PROGRESS')
       ON CONFLICT (gatepass_id) DO UPDATE
            SET actual_start = COALESCE(meeting_logs.actual_start, now()),
                status = 'IN_PROGRESS', updated_at = now()`,
      [id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'VISITOR_CHECKED_IN',
      entityType: 'gatepass',
      entityId: id,
      meta: { visitor_name: row.visitor_name },
      ip: req.ip,
    });
  });

  res.json(serializeGatepass(await loadById(id)));
}

export async function checkOut(req, res) {
  const id = Number(req.params.id);

  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM gatepass_requests WHERE id = $1 FOR UPDATE',
      [id]
    );
    const row = rows[0];
    if (!row) throw ApiError.notFound('That gate pass could not be found.');
    if (!row.check_in_time) {
      throw ApiError.conflict('This visitor has not checked in yet.');
    }
    if (row.check_out_time) {
      const at = new Date(row.check_out_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      throw ApiError.conflict(`Visitor already checked out at ${at}.`);
    }

    await client.query(
      'UPDATE gatepass_requests SET check_out_time = now(), updated_at = now() WHERE id = $1',
      [id]
    );
    // An early close already recorded the real end — preserve it.
    await client.query(
      `INSERT INTO meeting_logs (gatepass_id, actual_start, actual_end, status)
            VALUES ($1, now(), now(), 'COMPLETED')
       ON CONFLICT (gatepass_id) DO UPDATE
            SET actual_end = COALESCE(meeting_logs.actual_end, now()),
                status = CASE WHEN meeting_logs.status = 'EARLY_CLOSED'
                              THEN 'EARLY_CLOSED'::meeting_status
                              ELSE 'COMPLETED'::meeting_status END,
                updated_at = now()`,
      [id]
    );
    await logActivityTx(client, {
      userId: req.user.id,
      action: 'VISITOR_CHECKED_OUT',
      entityType: 'gatepass',
      entityId: id,
      meta: { visitor_name: row.visitor_name },
      ip: req.ip,
    });
  });

  res.json(serializeGatepass(await loadById(id)));
}

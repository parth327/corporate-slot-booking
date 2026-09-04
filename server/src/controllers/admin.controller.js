/**
 * GatePass — administrator endpoints: user management and system-wide visibility.
 */
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { env } from '../config/env.js';
import { publicUser, assertPasswordStrength } from './auth.controller.js';
import { listGatepassesQuery } from './gatepass.controller.js';
import { GATEPASS_SELECT, serializeMany } from '../services/gatepassSerializer.js';
import { logActivity } from '../services/activity.js';
import { safeSend } from '../services/mailer.js';
import * as templates from '../services/templates.js';
import { todayInOrgTz, normalizeTime, toDateOnly, minutesBetween } from '../utils/time.js';

const MAX_PAGE_SIZE = 100;

function paging(q) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Postgres reports a unique violation as 23505; surface it as a clean 409. */
function asDuplicate(err, message) {
  if (err && err.code === '23505') return ApiError.conflict(message, 'DUPLICATE');
  return err;
}

// --- users --------------------------------------------------------------------

export async function listUsers(req, res) {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (req.query.role) where.push(`role = ${push(req.query.role)}::user_role`);
  if (req.query.q) {
    const p = push(`%${req.query.q}%`);
    where.push(`(name ILIKE ${p} OR email ILIKE ${p} OR mobile ILIKE ${p} OR department ILIKE ${p})`);
  }
  if (req.query.active !== undefined && req.query.active !== null) {
    where.push(`is_active = ${push(req.query.active)}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limitP = push(pageSize);
  const offsetP = push(offset);
  const { rows } = await pool.query(
    `SELECT * FROM users ${whereSql} ORDER BY role, name LIMIT ${limitP} OFFSET ${offsetP}`,
    params
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total FROM users ${whereSql}`,
    params.slice(0, params.length - 2)
  );

  res.json({ items: rows.map(publicUser), total: countRows[0].total, page, pageSize });
}

export async function createUser(req, res) {
  const { name, email, password, role, mobile, department, designation } = req.body;
  const sendInvite = req.body.send_invite !== false;

  assertPasswordStrength(password);

  let created;
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, mobile, department, designation)
       VALUES ($1,$2,$3,$4::user_role,$5,$6,$7)
       RETURNING *`,
      [
        name,
        email.toLowerCase(),
        await bcrypt.hash(password, 10),
        role,
        mobile ?? null,
        department ?? null,
        designation ?? null,
      ]
    );
    created = rows[0];
  } catch (err) {
    throw asDuplicate(err, 'An account with that email address already exists.');
  }

  logActivity({
    userId: req.user.id,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: created.id,
    meta: { role: created.role, email: created.email },
    ip: req.ip,
  });

  res.status(201).json(publicUser(created));

  if (sendInvite) {
    void safeSend({
      to: [{ email: created.email, name: created.name }],
      ...templates.welcomeUser({
        user: publicUser(created),
        tempPassword: password,
        loginUrl: `${env.APP_URL}/login`,
      }),
    });
  }
}

export async function updateUser(req, res) {
  const id = Number(req.params.id);
  const { rows: existingRows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) throw ApiError.notFound('That user could not be found.');

  const sets = [];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  for (const field of ['name', 'mobile', 'department', 'designation']) {
    if (req.body[field] !== undefined) sets.push(`${field} = ${push(req.body[field])}`);
  }
  if (req.body.email !== undefined) sets.push(`email = ${push(req.body.email.toLowerCase())}`);
  if (req.body.role !== undefined) sets.push(`role = ${push(req.body.role)}::user_role`);
  if (req.body.is_active !== undefined) sets.push(`is_active = ${push(req.body.is_active)}`);
  if (req.body.password) {
    assertPasswordStrength(req.body.password);
    sets.push(`password_hash = ${push(await bcrypt.hash(req.body.password, 10))}`);
  }

  // Demoting or deactivating the last remaining admin would lock everyone out.
  const losingAdmin =
    existing.role === 'ADMIN' &&
    ((req.body.role !== undefined && req.body.role !== 'ADMIN') || req.body.is_active === false);
  if (losingAdmin) await assertNotLastAdmin(id);

  if (sets.length === 0) return res.json(publicUser(existing));

  let updated;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = ${push(id)} RETURNING *`,
      params
    );
    updated = rows[0];
  } catch (err) {
    throw asDuplicate(err, 'An account with that email address already exists.');
  }

  logActivity({
    userId: req.user.id,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: id,
    meta: { fields: Object.keys(req.body).filter((k) => k !== 'password') },
    ip: req.ip,
  });

  res.json(publicUser(updated));
}

async function assertNotLastAdmin(id) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS remaining FROM users
      WHERE role = 'ADMIN' AND is_active = TRUE AND id <> $1`,
    [id]
  );
  if (rows[0].remaining === 0) {
    throw ApiError.conflict('This is the last active administrator — promote another one first.');
  }
}

export async function deleteUser(req, res) {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    throw ApiError.conflict('You cannot deactivate your own account.');
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  const target = rows[0];
  if (!target) throw ApiError.notFound('That user could not be found.');
  if (target.role === 'ADMIN') await assertNotLastAdmin(id);

  await pool.query('UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1', [id]);

  logActivity({
    userId: req.user.id,
    action: 'USER_DEACTIVATED',
    entityType: 'user',
    entityId: id,
    meta: { email: target.email },
    ip: req.ip,
  });

  res.json({ ok: true });
}

// --- system-wide views ----------------------------------------------------------

export async function overview(req, res) {
  const today = todayInOrgTz();

  const [usersRes, roomsRes, statusRes, todayRes, upcomingRes, utilRes] = await Promise.all([
    pool.query(
      `SELECT role, count(*) FILTER (WHERE is_active)::int AS active, count(*)::int AS total
         FROM users GROUP BY role`
    ),
    pool.query(
      `SELECT count(*) FILTER (WHERE is_active)::int AS active, count(*)::int AS total
         FROM meeting_rooms`
    ),
    pool.query('SELECT status, count(*)::int AS count FROM gatepass_requests GROUP BY status'),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE g.status = 'APPROVED')::int AS expected,
         count(*) FILTER (WHERE g.check_in_time IS NOT NULL AND g.check_out_time IS NULL)::int AS checked_in,
         count(*) FILTER (WHERE g.check_out_time IS NOT NULL
               OR ml.status IN ('COMPLETED','EARLY_CLOSED'))::int AS completed
       FROM gatepass_requests g
       LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
      WHERE g.requested_date = $1`,
      [today]
    ),
    pool.query(
      `${GATEPASS_SELECT}
        WHERE g.status = 'APPROVED' AND g.requested_date >= $1
        ORDER BY g.requested_date, g.start_time
        LIMIT 10`,
      [today]
    ),
    pool.query(
      `SELECT r.id AS room_id, r.name AS room_name,
              count(g.id)::int AS bookings_today,
              COALESCE(SUM(EXTRACT(EPOCH FROM (g.end_time - g.start_time)) / 60), 0)::int AS minutes_booked
         FROM meeting_rooms r
         LEFT JOIN gatepass_requests g
                ON g.room_id = r.id AND g.requested_date = $1 AND g.status = 'APPROVED'
        WHERE r.is_active = TRUE
        GROUP BY r.id, r.name
        ORDER BY minutes_booked DESC, r.name`,
      [today]
    ),
  ]);

  const usersByRole = { ADMIN: 0, AUTHORITY: 0, GUARD: 0 };
  for (const row of usersRes.rows) usersByRole[row.role] = row.active;

  const gatepassesByStatus = {};
  for (const row of statusRes.rows) gatepassesByStatus[row.status] = row.count;

  res.json({
    counts: {
      users_by_role: usersByRole,
      users_total: usersRes.rows.reduce((sum, r) => sum + r.total, 0),
      rooms: roomsRes.rows[0].active,
      rooms_total: roomsRes.rows[0].total,
      gatepasses_by_status: gatepassesByStatus,
    },
    today: todayRes.rows[0],
    upcoming: serializeMany(upcomingRes.rows),
    room_utilisation: utilRes.rows,
  });
}

export async function gatepasses(req, res) {
  res.json(await listGatepassesQuery({ user: req.user, query: req.query, unscoped: true }));
}

export async function meetingLogs(req, res) {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (req.query.from) where.push(`g.requested_date >= ${push(req.query.from)}`);
  if (req.query.to) where.push(`g.requested_date <= ${push(req.query.to)}`);
  if (req.query.status) where.push(`ml.status = ${push(req.query.status)}::meeting_status`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limitP = push(pageSize);
  const offsetP = push(offset);

  const { rows } = await pool.query(
    `SELECT ml.id, ml.gatepass_id, ml.actual_start, ml.actual_end, ml.status,
            g.visitor_name, g.requested_date, g.start_time, g.end_time,
            u.name AS authority_name, r.name AS room_name
       FROM meeting_logs ml
       JOIN gatepass_requests g  ON g.id = ml.gatepass_id
       JOIN users u              ON u.id = g.authority_id
       LEFT JOIN meeting_rooms r ON r.id = g.room_id
       ${whereSql}
       ORDER BY COALESCE(ml.actual_start, g.requested_date::timestamptz) DESC, ml.id DESC
       LIMIT ${limitP} OFFSET ${offsetP}`,
    params
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total
       FROM meeting_logs ml JOIN gatepass_requests g ON g.id = ml.gatepass_id ${whereSql}`,
    params.slice(0, params.length - 2)
  );

  const items = rows.map((row) => ({
    id: row.id,
    gatepass_id: row.gatepass_id,
    visitor_name: row.visitor_name,
    authority_name: row.authority_name,
    room_name: row.room_name ?? null,
    requested_date: toDateOnly(row.requested_date),
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    actual_start: row.actual_start ? new Date(row.actual_start).toISOString() : null,
    actual_end: row.actual_end ? new Date(row.actual_end).toISOString() : null,
    status: row.status,
    duration_minutes:
      row.actual_start && row.actual_end
        ? Math.round((new Date(row.actual_end) - new Date(row.actual_start)) / 60000)
        : null,
  }));

  res.json({ items, total: countRows[0].total, page, pageSize });
}

export async function activity(req, res) {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (req.query.action) where.push(`a.action = ${push(req.query.action)}`);
  if (req.query.user_id) where.push(`a.user_id = ${push(req.query.user_id)}`);
  if (req.query.entity_type) where.push(`a.entity_type = ${push(req.query.entity_type)}`);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const limitP = push(pageSize);
  const offsetP = push(offset);

  const { rows } = await pool.query(
    `SELECT a.*, u.name AS actor_name
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${limitP} OFFSET ${offsetP}`,
    params
  );
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS total FROM activity_logs a ${whereSql}`,
    params.slice(0, params.length - 2)
  );

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor_name: row.actor_name ?? null,
      actor_label: row.actor_label ?? null,
      entity_type: row.entity_type ?? null,
      entity_id: row.entity_id ?? null,
      meta: row.meta ?? null,
      ip: row.ip ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
    total: countRows[0].total,
    page,
    pageSize,
  });
}

/**
 * GatePass — meeting room catalogue and availability.
 */
import { pool } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { roomAvailability, roomDaySchedule, allRoomsDaySchedule } from '../services/booking.js';
import { logActivity } from '../services/activity.js';
import { todayInOrgTz } from '../utils/time.js';

function asDuplicate(err) {
  if (err && err.code === '23505') {
    return ApiError.conflict(
      'A room with that name already exists in the same building and floor.',
      'DUPLICATE'
    );
  }
  return err;
}

export async function list(req, res) {
  // `active` omitted -> active rooms only; `active=false` -> the full catalogue.
  const activeOnly = req.query.active === undefined || req.query.active === null
    ? true
    : req.query.active;
  const { rows } = await pool.query(
    `SELECT * FROM meeting_rooms
      ${activeOnly ? 'WHERE is_active = TRUE' : ''}
      ORDER BY building NULLS FIRST, floor NULLS FIRST, name`
  );
  res.json(rows);
}

export async function availability(req, res) {
  const { date, start_time: startTime, end_time: endTime } = req.query;
  const fields = {};
  if (!date) fields.date = 'is required';
  if (!startTime) fields.start_time = 'is required';
  if (!endTime) fields.end_time = 'is required';
  if (Object.keys(fields).length) throw ApiError.badRequest('Validation failed', { fields });

  res.json(
    await roomAvailability({
      date,
      startTime,
      endTime,
      excludeGatepassId: req.query.exclude_gatepass_id ?? null,
    })
  );
}

export async function schedule(req, res) {
  res.json(await roomDaySchedule(Number(req.params.id), req.query.date || todayInOrgTz()));
}

export async function scheduleAll(req, res) {
  res.json(await allRoomsDaySchedule(req.query.date || todayInOrgTz()));
}

export async function create(req, res) {
  const { name, building, floor, capacity, amenities, is_active: isActive } = req.body;
  let room;
  try {
    const { rows } = await pool.query(
      `INSERT INTO meeting_rooms (name, building, floor, capacity, amenities, is_active)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6, TRUE)) RETURNING *`,
      [name, building ?? null, floor ?? null, capacity ?? 0, amenities ?? null, isActive ?? null]
    );
    room = rows[0];
  } catch (err) {
    throw asDuplicate(err);
  }

  logActivity({
    userId: req.user.id,
    action: 'ROOM_CREATED',
    entityType: 'room',
    entityId: room.id,
    meta: { name: room.name },
    ip: req.ip,
  });

  res.status(201).json(room);
}

export async function update(req, res) {
  const id = Number(req.params.id);
  const sets = [];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  for (const field of ['name', 'building', 'floor', 'capacity', 'amenities', 'is_active']) {
    if (req.body[field] !== undefined) sets.push(`${field} = ${push(req.body[field])}`);
  }
  if (sets.length === 0) {
    const { rows } = await pool.query('SELECT * FROM meeting_rooms WHERE id = $1', [id]);
    if (!rows[0]) throw ApiError.notFound('That meeting room could not be found.');
    return res.json(rows[0]);
  }

  let room;
  try {
    const { rows } = await pool.query(
      `UPDATE meeting_rooms SET ${sets.join(', ')} WHERE id = ${push(id)} RETURNING *`,
      params
    );
    room = rows[0];
  } catch (err) {
    throw asDuplicate(err);
  }
  if (!room) throw ApiError.notFound('That meeting room could not be found.');

  logActivity({
    userId: req.user.id,
    action: 'ROOM_UPDATED',
    entityType: 'room',
    entityId: id,
    meta: { fields: Object.keys(req.body) },
    ip: req.ip,
  });

  res.json(room);
}

/** Removes a room outright when nothing references it; deactivates it otherwise. */
export async function remove(req, res) {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM meeting_rooms WHERE id = $1', [id]);
  const room = rows[0];
  if (!room) throw ApiError.notFound('That meeting room could not be found.');

  const { rows: usage } = await pool.query(
    'SELECT 1 FROM gatepass_requests WHERE room_id = $1 LIMIT 1',
    [id]
  );

  const soft = usage.length > 0;
  if (soft) {
    await pool.query('UPDATE meeting_rooms SET is_active = FALSE WHERE id = $1', [id]);
  } else {
    await pool.query('DELETE FROM meeting_rooms WHERE id = $1', [id]);
  }

  logActivity({
    userId: req.user.id,
    action: soft ? 'ROOM_DEACTIVATED' : 'ROOM_DELETED',
    entityType: 'room',
    entityId: id,
    meta: { name: room.name },
    ip: req.ip,
  });

  res.json({
    ok: true,
    soft,
    message: soft
      ? `${room.name} has booking history, so it was deactivated rather than deleted.`
      : `${room.name} was deleted.`,
  });
}

/**
 * GatePass — room reservation rules.
 *
 * The single rule everything else defers to (docs/CONTRACT.md section 3):
 * a room is taken for a candidate slot when an APPROVED gatepass exists for the
 * same room and date, whose meeting has not been COMPLETED or EARLY_CLOSED, and
 * whose time range OVERLAPS the candidate range.
 *
 * `OVERLAPS` in Postgres treats ranges as half-open, so 14:00-15:00 and
 * 15:00-16:00 do not collide — which is what we want for back-to-back meetings.
 */
import { pool } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { normalizeTime, todayInOrgTz, minutesBetween, formatTimeHuman } from '../utils/time.js';

/** Shortest and longest meeting we will book. */
export const MIN_SLOT_MINUTES = 15;
export const MAX_SLOT_MINUTES = 8 * 60;

/** Accepts a transaction client or falls back to the pool. */
function db(client) {
  return client && typeof client.query === 'function' ? client : pool;
}

/**
 * Validates a requested slot on its own terms, before any room is involved.
 * @param {{requested_date:string,start_time:string,end_time:string}} slot
 * @throws {ApiError} 400 with a per-field `details.fields`
 */
export function assertValidSlot(slot = {}) {
  const date = slot.requested_date;
  const start = normalizeTime(slot.start_time);
  const end = normalizeTime(slot.end_time);
  const fields = {};

  if (!date) fields.requested_date = 'is required';
  else if (date < todayInOrgTz()) fields.requested_date = 'cannot be in the past';

  if (!start) fields.start_time = 'is required';
  if (!end) fields.end_time = 'is required';

  if (start && end) {
    const minutes = minutesBetween(start, end);
    if (minutes <= 0) {
      fields.end_time = 'must be after the start time';
    } else if (minutes < MIN_SLOT_MINUTES) {
      fields.end_time = `a meeting must run for at least ${MIN_SLOT_MINUTES} minutes`;
    } else if (minutes > MAX_SLOT_MINUTES) {
      fields.end_time = `a meeting cannot run longer than ${MAX_SLOT_MINUTES / 60} hours`;
    }
  }

  if (Object.keys(fields).length > 0) {
    throw ApiError.badRequest('Validation failed', { fields });
  }
}

/**
 * Takes a row lock on the room so two concurrent approvals cannot both see it free.
 * Must be called inside a transaction, before {@link findConflict}.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} roomId
 * @returns {Promise<object>} the locked room row
 */
export async function lockRoom(client, roomId) {
  const { rows } = await db(client).query(
    'SELECT * FROM meeting_rooms WHERE id = $1 FOR UPDATE',
    [roomId]
  );
  const room = rows[0];
  if (!room) throw ApiError.notFound('That meeting room no longer exists.');
  if (!room.is_active) {
    throw ApiError.badRequest(`${room.name} has been taken out of service and cannot be booked.`);
  }
  return room;
}

const CONFLICT_SQL = `
  SELECT g.id            AS gatepass_id,
         g.visitor_name,
         g.visitor_company,
         g.authority_id,
         u.name          AS authority_name,
         u.email         AS authority_email,
         g.start_time,
         g.end_time,
         g.room_id,
         r.name          AS room_name
    FROM gatepass_requests g
    JOIN users u              ON u.id = g.authority_id
    LEFT JOIN meeting_rooms r ON r.id = g.room_id
    LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
   WHERE g.room_id = $1
     AND g.requested_date = $2
     AND g.status = 'APPROVED'
     AND COALESCE(ml.status::text, 'SCHEDULED') NOT IN ('COMPLETED', 'EARLY_CLOSED')
     AND (g.start_time, g.end_time) OVERLAPS ($3::time, $4::time)
     AND ($5::int IS NULL OR g.id <> $5)
   ORDER BY g.start_time
   LIMIT 1`;

/**
 * @param {import('pg').PoolClient|null} client
 * @param {{roomId:number,date:string,startTime:string,endTime:string,excludeGatepassId?:number|null}} opts
 * @returns {Promise<object|null>} the holding booking, or null when the slot is free
 */
export async function findConflict(client, opts = {}) {
  const { roomId, date, startTime, endTime, excludeGatepassId = null } = opts;
  if (!roomId || !date || !startTime || !endTime) return null;

  const { rows } = await db(client).query(CONFLICT_SQL, [
    roomId,
    date,
    normalizeTime(startTime),
    normalizeTime(endTime),
    excludeGatepassId ?? null,
  ]);

  const hit = rows[0];
  if (!hit) return null;
  return {
    ...hit,
    start_time: normalizeTime(hit.start_time),
    end_time: normalizeTime(hit.end_time),
  };
}

/**
 * {@link findConflict} but throws the documented 409 instead of returning.
 * @throws {ApiError} 409 ROOM_CONFLICT carrying `details.conflict`
 */
export async function assertNoConflict(client, opts = {}) {
  const conflict = await findConflict(client, opts);
  if (!conflict) return;

  const room = conflict.room_name || 'That room';
  const when = `${formatTimeHuman(conflict.start_time)}–${formatTimeHuman(conflict.end_time)}`;
  const visitor = conflict.visitor_name ? ` (visitor: ${conflict.visitor_name})` : '';
  throw ApiError.conflict(
    `${room} is already booked ${when} by ${conflict.authority_name}${visitor}.`,
    'ROOM_CONFLICT',
    { conflict }
  );
}

/**
 * Every active room with a verdict for one specific slot, in a single query.
 *
 * @param {{date:string,startTime:string,endTime:string,excludeGatepassId?:number|null}} opts
 * @returns {Promise<Array<object & {is_available:boolean, occupied_by:object|null}>>}
 */
export async function roomAvailability(opts = {}) {
  const { date, startTime, endTime, excludeGatepassId = null } = opts;
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);

  const { rows } = await pool.query(
    `SELECT rm.*,
            busy.gatepass_id,
            busy.visitor_name,
            busy.visitor_company,
            busy.authority_id,
            busy.authority_name,
            busy.authority_email,
            busy.start_time AS busy_start,
            busy.end_time   AS busy_end
       FROM meeting_rooms rm
       LEFT JOIN LATERAL (
         SELECT g.id AS gatepass_id, g.visitor_name, g.visitor_company,
                g.authority_id, u.name AS authority_name, u.email AS authority_email,
                g.start_time, g.end_time
           FROM gatepass_requests g
           JOIN users u              ON u.id = g.authority_id
           LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
          WHERE g.room_id = rm.id
            AND g.requested_date = $1
            AND g.status = 'APPROVED'
            AND COALESCE(ml.status::text, 'SCHEDULED') NOT IN ('COMPLETED', 'EARLY_CLOSED')
            AND (g.start_time, g.end_time) OVERLAPS ($2::time, $3::time)
            AND ($4::int IS NULL OR g.id <> $4)
          ORDER BY g.start_time
          LIMIT 1
       ) busy ON TRUE
      WHERE rm.is_active = TRUE
      ORDER BY rm.building NULLS FIRST, rm.floor NULLS FIRST, rm.name`,
    [date, start, end, excludeGatepassId ?? null]
  );

  return rows.map((row) => {
    const occupied = row.gatepass_id != null;
    return {
      id: row.id,
      name: row.name,
      building: row.building,
      floor: row.floor,
      capacity: row.capacity,
      amenities: row.amenities,
      is_active: row.is_active,
      is_available: !occupied,
      occupied_by: occupied
        ? {
            gatepass_id: row.gatepass_id,
            visitor_name: row.visitor_name,
            visitor_company: row.visitor_company,
            authority_id: row.authority_id,
            authority_name: row.authority_name,
            authority_email: row.authority_email,
            start_time: normalizeTime(row.busy_start),
            end_time: normalizeTime(row.busy_end),
            room_id: row.id,
            room_name: row.name,
          }
        : null,
    };
  });
}

/**
 * One room's bookings for one day — the room board's data source.
 * Unlike {@link roomAvailability} this includes finished meetings, because the
 * board is a record of the day rather than a booking decision.
 */
export async function roomDaySchedule(roomId, date) {
  const day = date || todayInOrgTz();

  const roomRes = await pool.query('SELECT * FROM meeting_rooms WHERE id = $1', [roomId]);
  const room = roomRes.rows[0];
  if (!room) throw ApiError.notFound('That meeting room no longer exists.');

  const { rows } = await pool.query(
    `SELECT g.id AS gatepass_id, g.visitor_name, g.visitor_company,
            u.name AS authority_name, g.start_time, g.end_time,
            g.status, g.check_in_time, g.check_out_time, ml.status AS meeting_status
       FROM gatepass_requests g
       JOIN users u              ON u.id = g.authority_id
       LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
      WHERE g.room_id = $1
        AND g.requested_date = $2
        AND g.status = 'APPROVED'
      ORDER BY g.start_time`,
    [roomId, day]
  );

  const bookings = rows.map((row) => {
    let display = 'APPROVED';
    if (row.check_out_time || row.meeting_status === 'COMPLETED' || row.meeting_status === 'EARLY_CLOSED') {
      display = 'COMPLETED';
    } else if (row.check_in_time) {
      display = 'CHECKED_IN';
    }
    return {
      gatepass_id: row.gatepass_id,
      visitor_name: row.visitor_name,
      visitor_company: row.visitor_company,
      authority_name: row.authority_name,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      display_status: display,
    };
  });

  return { room, date: day, bookings };
}

/**
 * Every active room's bookings for one day, in a single round trip — the room
 * board's data source. Same shape as calling {@link roomDaySchedule} once per
 * room, but one query instead of N+1 (each of which is a full WAN round trip
 * to a hosted database).
 */
export async function allRoomsDaySchedule(date) {
  const day = date || todayInOrgTz();

  const { rows: rooms } = await pool.query(
    `SELECT * FROM meeting_rooms WHERE is_active = TRUE
      ORDER BY building NULLS FIRST, floor NULLS FIRST, name`
  );

  const { rows } = await pool.query(
    `SELECT g.room_id, g.id AS gatepass_id, g.visitor_name, g.visitor_company,
            u.name AS authority_name, g.start_time, g.end_time,
            g.status, g.check_in_time, g.check_out_time, ml.status AS meeting_status
       FROM gatepass_requests g
       JOIN users u              ON u.id = g.authority_id
       LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id
      WHERE g.requested_date = $1
        AND g.status = 'APPROVED'
      ORDER BY g.start_time`,
    [day]
  );

  const byRoom = new Map();
  for (const row of rows) {
    let display = 'APPROVED';
    if (row.check_out_time || row.meeting_status === 'COMPLETED' || row.meeting_status === 'EARLY_CLOSED') {
      display = 'COMPLETED';
    } else if (row.check_in_time) {
      display = 'CHECKED_IN';
    }
    const booking = {
      gatepass_id: row.gatepass_id,
      visitor_name: row.visitor_name,
      visitor_company: row.visitor_company,
      authority_name: row.authority_name,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      display_status: display,
    };
    if (!byRoom.has(row.room_id)) byRoom.set(row.room_id, []);
    byRoom.get(row.room_id).push(booking);
  }

  return rooms.map((room) => ({ room, bookings: byRoom.get(room.id) || [] }));
}

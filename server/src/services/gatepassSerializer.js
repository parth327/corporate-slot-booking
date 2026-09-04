/**
 * GatePass — the one place a gatepass row becomes JSON.
 *
 * Every endpoint that returns a gatepass goes through here, so the client can
 * rely on a single shape (docs/CONTRACT.md section 4). Callers append their own
 * WHERE / ORDER BY / LIMIT to {@link GATEPASS_SELECT}.
 */
import { toDateOnly, normalizeTime } from '../utils/time.js';

/**
 * The canonical projection. Aliases here are what {@link serializeGatepass}
 * reads, so a caller that hand-rolls a different SELECT will produce nulls.
 */
export const GATEPASS_SELECT = `
  SELECT g.*,
         u.name       AS authority_name,
         u.email      AS authority_email,
         u.mobile     AS authority_mobile,
         u.department AS authority_department,
         r.name       AS room_name,
         r.building   AS room_building,
         r.floor      AS room_floor,
         r.capacity   AS room_capacity,
         ml.status       AS meeting_status,
         ml.actual_start AS actual_start,
         ml.actual_end   AS actual_end
    FROM gatepass_requests g
    JOIN users u          ON u.id = g.authority_id
    LEFT JOIN meeting_rooms r ON r.id = g.room_id
    LEFT JOIN meeting_logs ml ON ml.gatepass_id = g.id`;

/** Timestamps go out as ISO strings; everything falsy goes out as null. */
function iso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * The badge the UI shows. Derived, never stored — see CONTRACT section 4.
 *
 * 1. anything but APPROVED reports itself
 * 2. checked out, or the meeting log says it is over -> COMPLETED
 * 3. checked in -> CHECKED_IN
 * 4. otherwise -> APPROVED
 *
 * @param {object} row a row from {@link GATEPASS_SELECT}
 * @returns {'PENDING'|'APPROVED'|'CHECKED_IN'|'COMPLETED'|'REJECTED'|'RESCHEDULE_REQUESTED'|'CANCELLED'}
 */
export function computeDisplayStatus(row) {
  if (!row) return 'PENDING';
  if (row.status !== 'APPROVED') return row.status;
  if (row.check_out_time) return 'COMPLETED';
  if (row.meeting_status === 'COMPLETED' || row.meeting_status === 'EARLY_CLOSED') return 'COMPLETED';
  if (row.check_in_time) return 'CHECKED_IN';
  return 'APPROVED';
}

/**
 * @param {object} row
 * @param {{includeQr?: boolean}} [options] `includeQr` is only ever true for the
 *   owning authority's detail view and for the approval email.
 */
export function serializeGatepass(row, options = {}) {
  if (!row) return null;
  const { includeQr = false } = options;

  const out = {
    id: row.id,

    visitor_name: row.visitor_name,
    visitor_company: row.visitor_company ?? null,
    visitor_designation: row.visitor_designation ?? null,
    visitor_mobile: row.visitor_mobile,
    visitor_whatsapp: row.visitor_whatsapp ?? null,
    visitor_email: row.visitor_email,

    authority_id: row.authority_id,
    authority_name: row.authority_name ?? null,
    authority_email: row.authority_email ?? null,
    authority_mobile: row.authority_mobile ?? null,
    authority_department: row.authority_department ?? null,

    reason: row.reason,
    requested_date: toDateOnly(row.requested_date),
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),

    status: row.status,
    display_status: computeDisplayStatus(row),
    authority_comment: row.authority_comment ?? null,

    room_id: row.room_id ?? null,
    room_name: row.room_name ?? null,
    room_building: row.room_building ?? null,
    room_floor: row.room_floor ?? null,
    room_capacity: row.room_capacity ?? null,

    qr_short_code: row.qr_short_code ?? null,

    check_in_time: iso(row.check_in_time),
    check_out_time: iso(row.check_out_time),
    is_closed_early: Boolean(row.is_closed_early),

    meeting_status: row.meeting_status ?? null,
    actual_start: iso(row.actual_start),
    actual_end: iso(row.actual_end),

    created_at: iso(row.created_at),
    approved_at: iso(row.approved_at),
  };

  if (includeQr) out.qr_code_hash = row.qr_code_hash ?? null;
  return out;
}

/** @param {object[]} rows */
export function serializeMany(rows, options = {}) {
  return (rows || []).map((row) => serializeGatepass(row, options));
}

export default serializeGatepass;

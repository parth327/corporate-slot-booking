/**
 * GatePass — date & time helpers.
 *
 * THE MODEL, in one paragraph: the database stores `requested_date` as a DATE and
 * `start_time`/`end_time` as TIME — wall-clock values with no timezone. The
 * organisation's wall clock sits `TZ_OFFSET_MINUTES` ahead of UTC (330 = IST).
 * So "10 Sep 2026, 14:00 in the office" is the UTC instant
 * `Date.UTC(2026, 8, 10, 14, 0) - 330 minutes`. Everything below is built on that
 * single rule; the reminder cron depends on it being exact.
 */
import env from '../config/env.js';

/** Organisation offset from UTC, in minutes (330 = IST, 0 = UTC, -300 = EST). */
export const ORG_OFFSET_MIN = env.TZ_OFFSET_MINUTES;

const MS_PER_MINUTE = 60_000;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Two-digit zero padding. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** The real current instant, in UTC. */
export function nowUtc() {
  return new Date();
}

/** "Now" shifted so the Date's UTC getters read as org-local wall-clock time. */
export function orgNow() {
  return new Date(Date.now() + ORG_OFFSET_MIN * MS_PER_MINUTE);
}

/** Today's date in the organisation's timezone, as 'YYYY-MM-DD'. */
export function todayInOrgTz() {
  const shifted = orgNow();
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * Coerces a pg DATE (string or Date) or an ISO string to 'YYYY-MM-DD'.
 * A Date at exact local midnight is read with local getters (that is how the pg
 * driver materialises a DATE); anything else is read in UTC.
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
export function toDateOnly(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const isLocalMidnight =
      value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0 && value.getMilliseconds() === 0;
    if (isLocalMidnight) {
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

/**
 * Trims a pg TIME ('14:00:00') or 'H:mm' down to 'HH:mm'.
 * @param {string|Date|null|undefined} value
 * @returns {string|null}
 */
export function normalizeTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`;
  }
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(value).trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** Minutes since midnight for 'HH:mm' (NaN-free: returns null when unparseable). */
export function timeToMinutes(value) {
  const normalized = normalizeTime(value);
  if (normalized === null) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Inverse of {@link timeToMinutes}; wraps into the 0..1439 range. */
export function minutesToTime(totalMinutes) {
  const safe = Number.isFinite(totalMinutes) ? Math.trunc(totalMinutes) : 0;
  const wrapped = ((safe % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/** Signed minutes from `startHHmm` to `endHHmm` on the same day. */
export function minutesBetween(startHHmm, endHHmm) {
  const start = timeToMinutes(startHHmm);
  const end = timeToMinutes(endHHmm);
  if (start === null || end === null) return null;
  return end - start;
}

/**
 * The true UTC instant of an org-local wall-clock date + time.
 * `Date.UTC(y, m-1, d, hh, mm)` minus the org offset — the one conversion the
 * reminder cron and the .ics builder both depend on.
 * @param {string|Date} dateStr 'YYYY-MM-DD'
 * @param {string} timeHHmm 'HH:mm' (or 'HH:mm:ss')
 * @returns {Date|null}
 */
export function combineToInstant(dateStr, timeHHmm) {
  const dateOnly = toDateOnly(dateStr);
  const time = normalizeTime(timeHHmm);
  if (!dateOnly || !time) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - ORG_OFFSET_MIN * MS_PER_MINUTE);
}

/** A new Date `n` minutes after `date` (accepts a Date or anything Date can parse). */
export function addMinutes(date, n) {
  const base = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + (Number(n) || 0) * MS_PER_MINUTE);
}

/** True when 'YYYY-MM-DD' is strictly before today in the org timezone. */
export function isPastDate(dateStr) {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return false;
  return dateOnly < todayInOrgTz();
}

/** '2026-09-10' -> '10 Sep 2026'. */
export function formatDateHuman(dateStr) {
  const dateOnly = toDateOnly(dateStr);
  if (!dateOnly) return '';
  const [year, month, day] = dateOnly.split('-').map(Number);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/** '14:00' -> '2:00 PM'. */
export function formatTimeHuman(timeHHmm) {
  const time = normalizeTime(timeHHmm);
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad2(minutes)} ${suffix}`;
}

/** '14:00','15:30' -> '2:00 PM – 3:30 PM'. */
export function formatRangeHuman(startHHmm, endHHmm) {
  const start = formatTimeHuman(startHHmm);
  const end = formatTimeHuman(endHHmm);
  if (!start && !end) return '';
  if (!end) return start;
  if (!start) return end;
  return `${start} – ${end}`;
}

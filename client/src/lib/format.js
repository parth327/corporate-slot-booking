/**
 * Presentation helpers.
 *
 * The API hands us dates as 'YYYY-MM-DD' and times as 'HH:mm'. Those are wall
 * clock values, not instants — passing them through `new Date()` would drag them
 * into the browser's timezone and shift them. Everything here parses by hand.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** '2026-09-10' -> '10 Sep 2026' */
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-09-10' -> 'Thursday' */
export function formatWeekday(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** '14:00' -> '2:00 PM' */
export function formatTime(value) {
  if (!value) return '';
  const [hRaw, mRaw] = String(value).split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(value);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** '14:00','15:30' -> '2:00 PM – 3:30 PM' */
export function formatRange(start, end) {
  if (!start && !end) return '';
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** An ISO instant -> '10 Sep 2026, 2:04 PM' in the viewer's own timezone. */
export function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

/** An ISO instant -> 'just now' / '4 min ago' / '3 days ago'. */
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  if (abs < 45) return 'just now';
  const units = [
    ['min', 60],
    ['hr', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2592000],
    ['year', 31536000],
  ];
  let label = 'min';
  let value = Math.round(abs / 60);
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const [name, size] = units[i];
    if (abs >= size) {
      label = name;
      value = Math.round(abs / size);
      break;
    }
  }
  const plural = value === 1 ? '' : 's';
  return future ? `in ${value} ${label}${plural}` : `${value} ${label}${plural} ago`;
}

/** Today in the viewer's timezone as 'YYYY-MM-DD' — safe for <input type="date" min>. */
export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Shifts an ISO date string by whole days. */
export function addDaysISO(value, days) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole minutes between two 'HH:mm' values. Negative when end precedes start. */
export function minutesBetween(start, end) {
  const toMin = (t) => {
    const [h, m] = String(t || '').split(':').map(Number);
    return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
  };
  const a = toMin(start);
  const b = toMin(end);
  if (a === null || b === null) return 0;
  return b - a;
}

/** 90 -> '1h 30m'; 45 -> '45m'; 120 -> '2h' */
export function durationLabel(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Elapsed label between an ISO instant and now, for the on-premises timer. */
export function elapsedSince(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  return durationLabel(Math.max(0, Math.round((Date.now() - then) / 60000)));
}

/** 'Asha Rao' -> 'AR' */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Digits only, keeping a leading '+', for tel: and wa.me links. */
function dialable(value) {
  const raw = String(value || '').trim();
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return digits ? `${plus ? '+' : ''}${digits}` : '';
}

export function telHref(mobile) {
  const n = dialable(mobile);
  return n ? `tel:${n}` : null;
}

/** wa.me wants bare digits with no plus. */
export function waHref(mobile, text) {
  const n = dialable(mobile).replace(/^\+/, '');
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function mailHref(email, subject) {
  const e = String(email || '').trim();
  if (!e) return null;
  return `mailto:${e}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

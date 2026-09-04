import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { combineToInstant, normalizeTime, toDateOnly } from './time.js';

/**
 * Minimal, spec-correct RFC 5545 builder for the single-event invites GatePass
 * attaches to approval emails. No dependency — the surface we need is small
 * and every value is escaped/folded here.
 */

const PRODID = '-//GatePass//Visitor Management//EN';
const MAX_OCTETS = 75;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && value.trim()) return new Date(value.trim());
  return new Date(Number.NaN);
}

/** 2026-09-10T08:30:00Z -> '20260910T083000Z' */
function toUtcStamp(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('buildIcs received an invalid date value');
  }
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT value: backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Escape a parameter value (e.g. CN=): quote it when it holds : ; or , */
function escapeParam(value) {
  const clean = String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .trim();
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

/** Fold a content line to <= 75 octets, continuation lines prefixed with one space. */
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= MAX_OCTETS) return line;

  const chunks = [];
  let start = 0;
  let limit = MAX_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    if (end < bytes.length) {
      // never split a multi-byte UTF-8 sequence
      while (end > start + 1 && (bytes[end] & 0xc0) === 0x80) end -= 1;
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = MAX_OCTETS - 1; // continuation lines carry a leading space
  }
  return chunks.join('\r\n ');
}

function uidDomain() {
  const raw = (env && env.APP_URL) || '';
  try {
    const parsed = new URL(raw);
    return parsed.hostname || 'gatepass.local';
  } catch {
    return 'gatepass.local';
  }
}

function normalisePerson(person) {
  if (!person) return null;
  const email = String(person.email || '').trim();
  if (!email || !email.includes('@')) return null;
  const name = String(person.name || '').trim();
  return { email, name: name || email };
}

/**
 * Build an RFC 5545 VCALENDAR containing a single VEVENT (METHOD:REQUEST).
 *
 * @param {object} opts
 * @param {string} [opts.uid]
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {string} [opts.location]
 * @param {Date|string|number} opts.start
 * @param {Date|string|number} opts.end
 * @param {{name?:string,email:string}} [opts.organizer]
 * @param {Array<{name?:string,email:string}>} [opts.attendees]
 * @returns {string} CRLF-joined iCalendar text
 */
export function buildIcs({
  uid,
  title,
  description,
  location,
  start,
  end,
  organizer,
  attendees,
} = {}) {
  const dtStart = toUtcStamp(start);
  const dtEnd = toUtcStamp(end);
  const eventUid =
    typeof uid === 'string' && uid.trim() ? uid.trim() : `${crypto.randomUUID()}@${uidDomain()}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeText(eventUid)}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(title || 'GatePass visit')}`,
  ];

  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);

  const host = normalisePerson(organizer);
  if (host) {
    lines.push(`ORGANIZER;CN=${escapeParam(host.name)}:mailto:${host.email}`);
  }

  const guests = Array.isArray(attendees) ? attendees : [];
  const seen = new Set();
  for (const guest of guests) {
    const person = normalisePerson(guest);
    if (!person) continue;
    const key = person.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      `ATTENDEE;CN=${escapeParam(person.name)};ROLE=REQ-PARTICIPANT;` +
        `PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${person.email}`
    );
  }

  lines.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title || 'GatePass visit')} starts in 30 minutes`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/**
 * Build the calendar attachment for an approved gate pass.
 *
 * @param {object} opts
 * @param {object} opts.gatepass serialized gate pass (or raw joined row)
 * @param {object} [opts.room] optional explicit room; falls back to gatepass.room_*
 * @param {object} [opts.authority] optional explicit host; falls back to gatepass.authority_*
 * @returns {{ name: string, contentBase64: string }}
 */
export function icsAttachment({ gatepass, room, authority } = {}) {
  if (!gatepass || gatepass.id === undefined || gatepass.id === null) {
    throw new Error('icsAttachment requires a gatepass with an id');
  }

  const roomName = (room && room.name) || gatepass.room_name || '';
  const building = (room && room.building) || gatepass.room_building || '';
  const floor = (room && room.floor) || gatepass.room_floor || '';

  const hostName =
    (authority && authority.name) || gatepass.authority_name || 'GatePass host';
  const hostEmail =
    (authority && authority.email) ||
    gatepass.authority_email ||
    (env && env.BREVO_SENDER_EMAIL) ||
    'no-reply@gatepass.local';

  const date = toDateOnly(gatepass.requested_date);
  const start = combineToInstant(date, normalizeTime(gatepass.start_time));
  const end = combineToInstant(date, normalizeTime(gatepass.end_time));

  const location =
    [roomName, building, floor ? `Floor ${floor}` : ''].filter(Boolean).join(', ') ||
    'Reception — room to be confirmed';

  const visitorLabel = gatepass.visitor_company
    ? `${gatepass.visitor_name} (${gatepass.visitor_company})`
    : `${gatepass.visitor_name}`;

  const description = [
    `Visitor: ${visitorLabel}`,
    gatepass.visitor_mobile ? `Visitor mobile: ${gatepass.visitor_mobile}` : '',
    `Host: ${hostName}`,
    gatepass.reason ? `Purpose: ${gatepass.reason}` : '',
    gatepass.qr_short_code ? `Gate pass code: ${gatepass.qr_short_code}` : '',
    'Please carry a photo ID and show the gate pass QR at the security desk.',
  ]
    .filter(Boolean)
    .join('\n');

  const attendees = [];
  if (gatepass.visitor_email) {
    attendees.push({ name: gatepass.visitor_name, email: gatepass.visitor_email });
  }
  attendees.push({ name: hostName, email: hostEmail });

  const content = buildIcs({
    uid: `gatepass-${gatepass.id}@${uidDomain()}`,
    title: `GatePass — ${gatepass.visitor_name} with ${hostName}`,
    description,
    location,
    start,
    end,
    organizer: { name: hostName, email: hostEmail },
    attendees,
  });

  return {
    name: `gatepass-${gatepass.id}.ics`,
    contentBase64: Buffer.from(content, 'utf8').toString('base64'),
  };
}

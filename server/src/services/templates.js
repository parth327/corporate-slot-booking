import { env } from '../config/env.js';
import {
  formatDateHuman,
  formatRangeHuman,
  formatTimeHuman,
  minutesBetween,
  normalizeTime,
  toDateOnly,
} from '../utils/time.js';

/**
 * Every GatePass email is produced here. All ten templates are pure functions
 * returning { subject, html, text } and share ONE table-based, 600px,
 * inline-CSS shell so they survive Outlook/Gmail/Apple Mail alike.
 *
 * Visitor-supplied strings (names, companies, reasons, comments) flow into
 * these templates, so every interpolated value goes through escapeHtml().
 */

/* ------------------------------------------------------------------ theme */

const BRAND = '#4f6ef7';
const BRAND_SOFT = '#dbe6ff';
const PAGE_BG = '#f7f8fb';
const CARD_BG = '#ffffff';
const LINE = '#eceef3';
const LINE_STRONG = '#d7dbe4';
const INK_900 = '#0d1220';
const INK_600 = '#3c4557';
const INK_500 = '#5a6478';
const INK_400 = '#8a93a6';
const SUCCESS = '#10b981';
const WARNING = '#f59e0b';
const DANGER = '#ef4444';
const VIOLET = '#7c3aed';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,Courier,monospace";

/* ----------------------------------------------------------------- escapes */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Only allow link schemes an email client should follow. */
function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return escapeHtml(raw);
  return '';
}

/** Only allow the PNG data URIs produced by utils/qr.js. */
function safeImageSrc(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(raw)) {
    return escapeHtml(raw.replace(/\s+/g, ''));
  }
  if (/^https?:\/\//i.test(raw)) return escapeHtml(raw);
  return '';
}

/* --------------------------------------------------------------- shell/HTML */

function rowsHtml(rows) {
  const visible = (rows || []).filter((r) => r && r.label && r.value);
  if (!visible.length) return '';
  const cells = visible
    .map((row, index) => {
      const last = index === visible.length - 1;
      const border = last ? 'none' : `1px solid ${LINE}`;
      return (
        `<tr>` +
        `<td class="gp-label" width="38%" style="padding:11px 16px;border-bottom:${border};` +
        `font:600 11px/1.5 ${FONT};letter-spacing:.6px;text-transform:uppercase;color:${INK_500};` +
        `vertical-align:top;">${escapeHtml(row.label)}</td>` +
        `<td class="gp-value" style="padding:11px 16px;border-bottom:${border};` +
        `font:500 14px/1.55 ${FONT};color:${INK_900};vertical-align:top;">` +
        `${escapeHtml(row.value)}</td>` +
        `</tr>`
      );
    })
    .join('');
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;border-collapse:separate;border:1px solid ${LINE};border-radius:12px;` +
    `background:${PAGE_BG};margin:20px 0 4px;">${cells}</table>`
  );
}

function ctaHtml(cta) {
  if (!cta) return '';
  const href = safeUrl(cta.url);
  const label = escapeHtml(cta.label || 'Open GatePass');
  if (!href) return '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin:24px 0 6px;"><tr>` +
    `<td align="center" bgcolor="${BRAND}" style="border-radius:12px;">` +
    `<a href="${href}" target="_blank" rel="noopener" ` +
    `style="display:inline-block;padding:14px 30px;font:600 15px/1.2 ${FONT};color:#ffffff;` +
    `text-decoration:none;border-radius:12px;min-width:160px;text-align:center;">${label}</a>` +
    `</td></tr></table>` +
    `<p style="margin:4px 0 0;font:400 12px/1.7 ${FONT};color:${INK_400};word-break:break-all;">` +
    `Or paste this link into your browser: ${href}</p>`
  );
}

function noteHtml(note, tone = 'neutral') {
  if (!note) return '';
  const tones = {
    neutral: { bg: PAGE_BG, border: LINE_STRONG, color: INK_600 },
    success: { bg: '#ecfdf5', border: SUCCESS, color: '#065f46' },
    warning: { bg: '#fffbeb', border: WARNING, color: '#92400e' },
    danger: { bg: '#fef2f2', border: DANGER, color: '#991b1b' },
    violet: { bg: '#f5f3ff', border: VIOLET, color: '#5b21b6' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;margin:18px 0 0;"><tr>` +
    `<td style="padding:13px 16px;background:${t.bg};border-left:3px solid ${t.border};` +
    `border-radius:0 10px 10px 0;font:400 13px/1.65 ${FONT};color:${t.color};">` +
    `${escapeHtml(note)}</td></tr></table>`
  );
}

function quoteHtml(label, body) {
  if (!body) return '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;margin:18px 0 0;"><tr>` +
    `<td style="padding:14px 16px;background:${PAGE_BG};border:1px solid ${LINE};border-radius:12px;">` +
    `<div style="font:600 11px/1.5 ${FONT};letter-spacing:.6px;text-transform:uppercase;` +
    `color:${INK_500};padding-bottom:6px;">${escapeHtml(label)}</div>` +
    `<div style="font:400 14px/1.65 ${FONT};color:${INK_900};white-space:pre-wrap;">` +
    `${escapeHtml(body)}</div></td></tr></table>`
  );
}

function codeHtml(code, caption) {
  if (!code) return '';
  const cap = caption
    ? `<div style="font:400 12px/1.6 ${FONT};color:${INK_400};padding-top:8px;">${escapeHtml(
        caption
      )}</div>`
    : '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;margin:16px 0 0;"><tr><td align="center">` +
    `<span style="display:inline-block;padding:12px 22px;background:${PAGE_BG};` +
    `border:1px dashed ${LINE_STRONG};border-radius:12px;font:700 26px/1.2 ${MONO};` +
    `letter-spacing:5px;color:${INK_900};">${escapeHtml(code)}</span>${cap}` +
    `</td></tr></table>`
  );
}

/**
 * The gate pass as one self-contained "badge" block — QR, code and the facts
 * a visitor needs at the gate, together in one bordered card — rather than a
 * bare QR image with the rest of the details scattered in a plain table below
 * it. Mirrors the client dashboard's GatepassCard visually as closely as
 * table-based, Outlook-safe email markup allows (a solid brand fill instead
 * of the client's CSS gradient — gradients render inconsistently in Outlook's
 * Word rendering engine).
 */
function gatepassCardHtml({ visitorName, visitorSub, statusLabel, qrImageUrl, code, facts = [] }) {
  const src = safeImageSrc(qrImageUrl);
  const visibleFacts = facts.filter((f) => f && f.value);

  const factsHtml = visibleFacts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px;">` +
      visibleFacts
        .map(
          (f) =>
            `<tr><td style="padding:5px 0;font:400 13px/1.6 ${FONT};color:${INK_500};" width="34%">${escapeHtml(
              f.label
            )}</td>` +
            `<td style="padding:5px 0;font:600 13px/1.6 ${FONT};color:${INK_900};">${escapeHtml(f.value)}</td></tr>`
        )
        .join('') +
      `</table>`
    : '';

  const qrBlock = src
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;"><tr><td align="center" style="padding:14px;background:${CARD_BG};border:1px dashed ${BRAND};border-radius:16px;">` +
      `<img src="${src}" width="180" height="180" alt="GatePass QR code" style="display:block;width:180px;height:180px;border:0;outline:none;text-decoration:none;background:#ffffff;" />` +
      (code
        ? `<div style="margin-top:10px;font:700 18px/1.2 ${MONO};letter-spacing:4px;color:${INK_900};">${escapeHtml(
            code
          )}</div>`
        : '') +
      `<div style="margin-top:6px;font:600 11px/1.6 ${FONT};color:${INK_500};">Show this at the security desk</div>` +
      `</td></tr></table>`
    : '';

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;margin:20px 0 0;border:1px solid ${LINE};border-radius:18px;overflow:hidden;">` +
    `<tr><td bgcolor="${BRAND}" style="background:${BRAND};padding:16px 22px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="left" style="font:700 13px/1.4 ${FONT};color:#ffffff;letter-spacing:.3px;">VISITOR PASS</td>` +
    `<td align="right" style="font:600 11px/1.4 ${FONT};color:${BRAND_SOFT};text-transform:uppercase;letter-spacing:.5px;">${escapeHtml(
      statusLabel || 'Approved'
    )}</td>` +
    `</tr></table></td></tr>` +
    `<tr><td bgcolor="${CARD_BG}" style="background:${CARD_BG};padding:22px;">` +
    `<div style="font:700 17px/1.3 ${FONT};color:${INK_900};">${escapeHtml(visitorName || '')}</div>` +
    (visitorSub
      ? `<div style="margin-top:2px;font:400 13px/1.5 ${FONT};color:${INK_500};">${escapeHtml(visitorSub)}</div>`
      : '') +
    qrBlock +
    factsHtml +
    `</td></tr></table>`
  );
}

function renderShell({ preheader, heading, intro, blocks = [], footerNote }) {
  const body = blocks.filter(Boolean).join('');
  const pre = preheader ? escapeHtml(preheader) : '';
  const foot =
    footerNote ||
    'This is an automated message from GatePass. Please do not reply to this email.';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<title>${escapeHtml(heading || 'GatePass')}</title>
<style type="text/css">
a{color:${BRAND}}
@media only screen and (max-width:620px){
.gp-shell{width:100% !important;max-width:100% !important}
.gp-pad{padding:22px 18px !important}
.gp-head{padding:18px 18px !important}
.gp-label,.gp-value{display:block !important;width:100% !important}
.gp-label{padding:12px 14px 2px 14px !important;border-bottom:0 !important}
.gp-value{padding:0 14px 12px 14px !important}
}
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:${PAGE_BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${PAGE_BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="gp-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="gp-head" bgcolor="${BRAND}" style="background:${BRAND};border-radius:16px 16px 0 0;padding:20px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" style="font:700 21px/1.2 ${FONT};color:#ffffff;letter-spacing:-.3px;">GatePass</td>
<td align="right" style="font:600 11px/1.6 ${FONT};color:${BRAND_SOFT};letter-spacing:.5px;text-transform:uppercase;">Visitor Management</td>
</tr></table>
</td></tr>
<tr><td class="gp-pad" bgcolor="${CARD_BG}" style="background:${CARD_BG};padding:28px;border:1px solid ${LINE};border-top:0;border-radius:0 0 16px 16px;">
<h1 style="margin:0 0 10px;font:700 20px/1.35 ${FONT};color:${INK_900};letter-spacing:-.2px;">${escapeHtml(
    heading || ''
  )}</h1>
${intro ? `<p style="margin:0;font:400 14px/1.7 ${FONT};color:${INK_600};">${escapeHtml(intro)}</p>` : ''}
${body}
</td></tr>
<tr><td align="center" style="padding:18px 20px 4px;font:400 12px/1.7 ${FONT};color:${INK_400};">${escapeHtml(
    foot
  )}</td></tr>
<tr><td align="center" style="padding:0 20px 8px;font:400 11px/1.6 ${FONT};color:${INK_400};">&copy; ${new Date().getFullYear()} GatePass</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ---------------------------------------------------------------- shell/text */

function renderText({ heading, intro, rows = [], textBlocks = [], cta, note, rowsFirst = true }) {
  const out = ['GatePass — Visitor Management', '=============================', ''];
  if (heading) out.push(heading, '');
  if (intro) out.push(intro, '');
  const visible = rows.filter((r) => r && r.label && r.value);
  const pushRows = () => {
    if (!visible.length) return;
    for (const row of visible) out.push(`${row.label}: ${row.value}`);
    out.push('');
  };
  if (rowsFirst) pushRows();
  for (const block of textBlocks.filter(Boolean)) out.push(block, '');
  if (!rowsFirst) pushRows();
  if (cta && cta.url) out.push(`${cta.label || 'Open GatePass'}: ${cta.url}`, '');
  if (note) out.push(note, '');
  out.push('This is an automated message from GatePass. Please do not reply to this email.');
  return out.join('\n');
}

/**
 * Assemble one email from the shared shell.
 * `blocks` are HTML fragments; `textBlocks` are their plain-text equivalents.
 */
function compose({
  subject,
  preheader,
  heading,
  intro,
  rows = [],
  blocks = [],
  cta,
  note,
  noteTone = 'neutral',
  textBlocks = [],
  footerNote,
  rowsFirst = true,
}) {
  const htmlBlocks = [...blocks];
  const rowsMarkup = rowsHtml(rows);
  if (rowsMarkup) {
    if (rowsFirst) htmlBlocks.unshift(rowsMarkup);
    else htmlBlocks.push(rowsMarkup);
  }
  if (cta) htmlBlocks.push(ctaHtml(cta));
  if (note) htmlBlocks.push(noteHtml(note, noteTone));

  return {
    subject,
    html: renderShell({ preheader, heading, intro, blocks: htmlBlocks, footerNote }),
    text: renderText({ heading, intro, rows, textBlocks, cta, note, rowsFirst }),
  };
}

/* ----------------------------------------------------------------- helpers */

function appUrl() {
  return String((env && env.APP_URL) || 'http://localhost:5173').replace(/\/+$/, '');
}

function dateOf(gatepass) {
  return toDateOnly(gatepass?.requested_date);
}

function dateHuman(gatepass) {
  const date = dateOf(gatepass);
  return date ? formatDateHuman(date) : 'Date to be confirmed';
}

function startHuman(gatepass) {
  return formatTimeHuman(normalizeTime(gatepass?.start_time));
}

function rangeHuman(gatepass) {
  return formatRangeHuman(normalizeTime(gatepass?.start_time), normalizeTime(gatepass?.end_time));
}

function whenHuman(gatepass) {
  return `${dateHuman(gatepass)}, ${rangeHuman(gatepass)}`;
}

function durationHuman(gatepass) {
  const mins = minutesBetween(normalizeTime(gatepass?.start_time), normalizeTime(gatepass?.end_time));
  if (!Number.isFinite(mins) || mins <= 0) return '';
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours && rest) return `${hours} hr ${rest} min`;
  if (hours) return `${hours} hr`;
  return `${rest} min`;
}

function visitorLabel(gatepass) {
  const parts = [gatepass?.visitor_name];
  if (gatepass?.visitor_designation) parts.push(gatepass.visitor_designation);
  if (gatepass?.visitor_company) parts.push(gatepass.visitor_company);
  return parts.filter(Boolean).join(' · ');
}

function pickRoom(room, gatepass) {
  return {
    name: (room && room.name) || gatepass?.room_name || '',
    building: (room && room.building) || gatepass?.room_building || '',
    floor: (room && room.floor) || gatepass?.room_floor || '',
    capacity: (room && room.capacity) || gatepass?.room_capacity || '',
  };
}

function roomLine(room, gatepass) {
  const r = pickRoom(room, gatepass);
  if (!r.name) return 'To be assigned at reception';
  const extra = [r.building, r.floor ? `Floor ${r.floor}` : ''].filter(Boolean).join(', ');
  return extra ? `${r.name} — ${extra}` : r.name;
}

function hostOf(authority, gatepass) {
  return {
    name: (authority && authority.name) || gatepass?.authority_name || 'your host',
    email: (authority && authority.email) || gatepass?.authority_email || '',
    mobile: (authority && authority.mobile) || gatepass?.authority_mobile || '',
    department: (authority && authority.department) || gatepass?.authority_department || '',
  };
}

function reference(gatepass) {
  return gatepass?.id ? `GP-${gatepass.id}` : '';
}

const ROLE_LABEL = {
  ADMIN: 'Administrator',
  AUTHORITY: 'Authority (meeting host)',
  GUARD: 'Security guard',
};

/* --------------------------------------------------------------- templates */

/** 1. A visitor submitted a request — the host must act. */
export function newRequestToAuthority({ gatepass, authority, actionUrl } = {}) {
  const g = gatepass || {};
  const host = hostOf(authority, g);
  const url = safeUrl(actionUrl) ? actionUrl : `${appUrl()}/authority/requests/${g.id ?? ''}`;

  return compose({
    subject: `New visitor request — ${g.visitor_name || 'Visitor'} on ${dateHuman(g)}`,
    preheader: `${g.visitor_name || 'A visitor'} wants to meet you ${whenHuman(g)}.`,
    heading: 'New visitor request awaiting your approval',
    intro: `Hi ${host.name}, ${
      g.visitor_name || 'a visitor'
    } has requested a meeting with you. Approve it with a room, decline it, or propose a different time.`,
    rows: [
      { label: 'Visitor', value: visitorLabel(g) },
      { label: 'Mobile', value: g.visitor_mobile },
      { label: 'Email', value: g.visitor_email },
      { label: 'Date', value: dateHuman(g) },
      { label: 'Time', value: rangeHuman(g) },
      { label: 'Duration', value: durationHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [quoteHtml('Purpose of visit', g.reason)],
    textBlocks: [g.reason ? `Purpose of visit:\n${g.reason}` : ''],
    cta: { label: 'Review this request', url },
    note: 'No room is reserved until you approve. The visitor is notified automatically once you respond.',
  });
}

/** 2. Approved — the visitor gets the QR pass, as one unified badge-style card. */
export function approvedToVisitor({ gatepass, qrImageUrl, room, authority } = {}) {
  const g = gatepass || {};
  const host = hostOf(authority, g);
  const r = pickRoom(room, g);
  const code = g.qr_short_code || '';

  const card = gatepassCardHtml({
    visitorName: g.visitor_name,
    visitorSub: [g.visitor_designation, g.visitor_company].filter(Boolean).join(' · '),
    statusLabel: 'Approved',
    qrImageUrl,
    code,
    facts: [
      { label: 'Date', value: dateHuman(g) },
      { label: 'Time', value: rangeHuman(g) },
      { label: 'Room', value: r.name || 'To be assigned at reception' },
      { label: 'Host', value: host.name },
    ],
  });

  return compose({
    subject: `Your GatePass is approved — ${dateHuman(g)} at ${startHuman(g)}`,
    preheader: `Approved by ${host.name}. ${whenHuman(g)}${r.name ? ` · ${r.name}` : ''}.`,
    heading: 'Your visit is approved',
    intro: `Hi ${g.visitor_name || 'there'}, ${host.name} approved your visit. Show the pass below at the security desk when you arrive.`,
    rows: [
      { label: 'Host phone', value: host.mobile },
      { label: 'Department', value: host.department },
      { label: 'Building', value: r.building },
      { label: 'Floor', value: r.floor ? String(r.floor) : '' },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [card],
    rowsFirst: false,
    textBlocks: [
      code ? `Gate pass code (read this out if the QR cannot be scanned): ${code}` : '',
      'The scannable QR code is in the HTML version of this email, and also attached to this message as an image — open it on your phone at the gate, or use the code above.',
    ],
    note: 'Please carry a government photo ID, arrive about 10 minutes early, and note that this pass is valid only for the date and time above. If the QR code below does not appear, open the attached image instead.',
    noteTone: 'success',
  });
}

/** 3. Approved — the host gets the confirmation + calendar invite. */
export function approvedToAuthority({ gatepass, room, visitor } = {}) {
  const g = gatepass || {};
  const r = pickRoom(room, g);
  const guest = {
    name: (visitor && visitor.name) || g.visitor_name || 'Visitor',
    company: (visitor && visitor.company) || g.visitor_company || '',
    mobile: (visitor && visitor.mobile) || g.visitor_mobile || '',
    email: (visitor && visitor.email) || g.visitor_email || '',
  };

  return compose({
    subject: `Visit confirmed — ${guest.name} on ${dateHuman(g)} at ${startHuman(g)}`,
    preheader: `${guest.name} is booked into ${r.name || 'a room'} ${whenHuman(g)}.`,
    heading: 'Visit confirmed and room reserved',
    intro: `You approved ${guest.name}'s visit. The room is now held for this slot and the visitor has received their QR gate pass.`,
    rows: [
      { label: 'Visitor', value: guest.company ? `${guest.name} · ${guest.company}` : guest.name },
      { label: 'Mobile', value: guest.mobile },
      { label: 'Email', value: guest.email },
      { label: 'Room', value: roomLine(room, g) },
      { label: 'Date', value: dateHuman(g) },
      { label: 'Time', value: rangeHuman(g) },
      { label: 'Duration', value: durationHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [quoteHtml('Purpose of visit', g.reason)],
    textBlocks: [g.reason ? `Purpose of visit:\n${g.reason}` : ''],
    cta: { label: 'Open in GatePass', url: `${appUrl()}/authority/requests/${g.id ?? ''}` },
    note: 'A calendar invite is attached. If the meeting ends early, close it in GatePass to release the room for others.',
    noteTone: 'success',
  });
}

/** 4. Declined. */
export function rejectedToVisitor({ gatepass, comment, authority } = {}) {
  const g = gatepass || {};
  const host = hostOf(authority, g);
  const reason = comment || g.authority_comment || '';

  return compose({
    subject: `Your GatePass request was declined — ${dateHuman(g)}`,
    preheader: `${host.name} could not accept your request for ${whenHuman(g)}.`,
    heading: 'Your visit request was declined',
    intro: `Hi ${g.visitor_name || 'there'}, ${host.name} was unable to accept your request for ${whenHuman(
      g
    )}. No gate pass has been issued.`,
    rows: [
      { label: 'Host', value: host.name },
      { label: 'Requested date', value: dateHuman(g) },
      { label: 'Requested time', value: rangeHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [quoteHtml('Reason given', reason)],
    textBlocks: [reason ? `Reason given:\n${reason}` : ''],
    cta: { label: 'Submit a new request', url: `${appUrl()}/` },
    note: host.email
      ? `If you believe this was a mistake, reply to ${host.email} or submit a fresh request with a different time.`
      : 'You are welcome to submit a fresh request with a different time.',
    noteTone: 'danger',
  });
}

/** 5. The host asked the visitor to pick another time. */
export function rescheduleToVisitor({ gatepass, comment, rescheduleUrl, authority } = {}) {
  const g = gatepass || {};
  const host = hostOf(authority, g);
  const reason = comment || g.authority_comment || '';
  const url = safeUrl(rescheduleUrl) ? rescheduleUrl : `${appUrl()}/`;

  return compose({
    subject: `A new time is needed for your visit — ${dateHuman(g)}`,
    preheader: `${host.name} asked you to propose a different slot.`,
    heading: 'Please pick a new time for your visit',
    intro: `Hi ${g.visitor_name || 'there'}, ${host.name} is not available for ${whenHuman(
      g
    )} and has asked you to choose another slot. Your request stays open until you do.`,
    rows: [
      { label: 'Host', value: host.name },
      { label: 'Original date', value: dateHuman(g) },
      { label: 'Original time', value: rangeHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [quoteHtml('Message from your host', reason)],
    textBlocks: [reason ? `Message from your host:\n${reason}` : ''],
    cta: { label: 'Choose a new time', url },
    note: 'This link is personal to your request and stays valid for 30 days. Your host is notified as soon as you submit a new time.',
    noteTone: 'violet',
  });
}

/** 6. The host moved an approved meeting to a different room. */
export function roomSwitchedNotice({ gatepass, oldRoom, newRoom } = {}) {
  const g = gatepass || {};
  const from = oldRoom && oldRoom.name ? roomLine(oldRoom, null) : 'Previously assigned room';
  const to = roomLine(newRoom, g);

  return compose({
    subject: `Room changed for ${dateHuman(g)} — now ${
      (newRoom && newRoom.name) || g.room_name || 'a new room'
    }`,
    preheader: `Your meeting has moved to ${to}.`,
    heading: 'Your meeting room has changed',
    intro: `The room for the visit on ${whenHuman(
      g
    )} has been changed. Everything else — the date, the time and the gate pass QR — stays exactly the same.`,
    rows: [
      { label: 'Visitor', value: visitorLabel(g) },
      { label: 'Host', value: g.authority_name },
      { label: 'Previous room', value: from },
      { label: 'New room', value: to },
      { label: 'Date', value: dateHuman(g) },
      { label: 'Time', value: rangeHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    note: 'No new QR code is needed — the existing gate pass remains valid. Security will direct you to the new room.',
    noteTone: 'warning',
  });
}

/** 7. Thirty minutes to go — wording differs per recipient. */
export function reminder30({ gatepass, room, recipientRole } = {}) {
  const g = gatepass || {};
  const roleValue = String(recipientRole || 'VISITOR').toUpperCase();
  const isAuthority = roleValue === 'AUTHORITY';
  const where = roomLine(room, g);
  const code = g.qr_short_code || '';

  const rows = [
    { label: isAuthority ? 'Visitor' : 'Host', value: isAuthority ? visitorLabel(g) : g.authority_name },
    {
      label: isAuthority ? 'Visitor mobile' : 'Host phone',
      value: isAuthority ? g.visitor_mobile : g.authority_mobile,
    },
    { label: 'Room', value: where },
    { label: 'Date', value: dateHuman(g) },
    { label: 'Time', value: rangeHuman(g) },
    { label: 'Reference', value: reference(g) },
  ];

  if (isAuthority) {
    return compose({
      subject: `In 30 minutes: ${g.visitor_name || 'your visitor'} arrives at ${startHuman(g)}`,
      preheader: `${g.visitor_name || 'Your visitor'} is expected in ${where} at ${startHuman(g)}.`,
      heading: 'Your visitor arrives in 30 minutes',
      intro: `${
        g.visitor_name || 'Your visitor'
      } is scheduled to arrive at ${startHuman(g)}. Security will check them in and direct them to ${where}.`,
      rows,
      blocks: [quoteHtml('Purpose of visit', g.reason)],
      textBlocks: [g.reason ? `Purpose of visit:\n${g.reason}` : ''],
      cta: { label: 'Open in GatePass', url: `${appUrl()}/authority/requests/${g.id ?? ''}` },
      note: 'If your plans changed, close the meeting early in GatePass so the room is released for someone else.',
      noteTone: 'warning',
    });
  }

  return compose({
    subject: `Reminder: your visit starts in 30 minutes (${startHuman(g)})`,
    preheader: `Your meeting with ${g.authority_name || 'your host'} starts at ${startHuman(g)}.`,
    heading: 'Your visit starts in 30 minutes',
    intro: `Hi ${g.visitor_name || 'there'}, your meeting with ${
      g.authority_name || 'your host'
    } starts at ${startHuman(g)}. Have your gate pass QR ready at the security desk.`,
    rows,
    blocks: [codeHtml(code, code ? 'Show the QR from your approval email, or read out this code.' : '')],
    textBlocks: [code ? `Gate pass code: ${code}` : ''],
    note: 'Please carry a government photo ID and allow a few minutes for security check-in.',
    noteTone: 'warning',
  });
}

/** 8. The host closed the meeting before the booked end time. */
export function meetingClosedEarly({ gatepass } = {}) {
  const g = gatepass || {};

  return compose({
    subject: `Meeting closed early — ${g.visitor_name || 'visitor'} on ${dateHuman(g)}`,
    preheader: `The booking for ${whenHuman(g)} has ended and the room is free.`,
    heading: 'Meeting marked as closed',
    intro: `The meeting between ${g.visitor_name || 'the visitor'} and ${
      g.authority_name || 'the host'
    } was closed before its scheduled end. The room is now available for other bookings.`,
    rows: [
      { label: 'Visitor', value: visitorLabel(g) },
      { label: 'Host', value: g.authority_name },
      { label: 'Room', value: roomLine(null, g) },
      { label: 'Date', value: dateHuman(g) },
      { label: 'Booked time', value: rangeHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    note: 'The gate pass for this visit can no longer be used to check in. A fresh request is needed for any follow-up visit.',
  });
}

/** 9. The visitor proposed a new slot — the host must approve again. */
export function visitorRescheduledToAuthority({ gatepass, actionUrl } = {}) {
  const g = gatepass || {};
  const url = safeUrl(actionUrl) ? actionUrl : `${appUrl()}/authority/requests/${g.id ?? ''}`;

  return compose({
    subject: `New time proposed — ${g.visitor_name || 'Visitor'} on ${dateHuman(g)}`,
    preheader: `${g.visitor_name || 'The visitor'} proposed ${whenHuman(g)}.`,
    heading: 'A visitor proposed a new time',
    intro: `${
      g.visitor_name || 'The visitor'
    } responded to your reschedule request with a new slot. The request is pending your approval again — no room is held until you approve it.`,
    rows: [
      { label: 'Visitor', value: visitorLabel(g) },
      { label: 'Mobile', value: g.visitor_mobile },
      { label: 'Email', value: g.visitor_email },
      { label: 'New date', value: dateHuman(g) },
      { label: 'New time', value: rangeHuman(g) },
      { label: 'Duration', value: durationHuman(g) },
      { label: 'Reference', value: reference(g) },
    ],
    blocks: [quoteHtml('Purpose of visit', g.reason)],
    textBlocks: [g.reason ? `Purpose of visit:\n${g.reason}` : ''],
    cta: { label: 'Review the new time', url },
    note: 'Approve with a room, decline, or ask for yet another time — the visitor is notified either way.',
    noteTone: 'violet',
  });
}

/** 10. A new staff account was created. */
export function welcomeUser({ user, tempPassword, loginUrl } = {}) {
  const u = user || {};
  const url = safeUrl(loginUrl) ? loginUrl : `${appUrl()}/login`;
  const role = ROLE_LABEL[String(u.role || '').toUpperCase()] || 'Team member';

  return compose({
    subject: 'Your GatePass account is ready',
    preheader: `Sign in as ${u.email || 'your new account'} and set your own password.`,
    heading: 'Welcome to GatePass',
    intro: `Hi ${u.name || 'there'}, an account has been created for you on GatePass — the visitor management and meeting-room booking system.`,
    rows: [
      { label: 'Name', value: u.name },
      { label: 'Sign-in email', value: u.email },
      { label: 'Role', value: role },
      { label: 'Department', value: u.department },
    ],
    blocks: [
      tempPassword ? codeHtml(tempPassword, 'Temporary password — change it after your first sign-in.') : '',
    ],
    textBlocks: [tempPassword ? `Temporary password: ${tempPassword}` : ''],
    cta: { label: 'Sign in to GatePass', url },
    note: 'For your security, change this temporary password from your profile immediately after signing in, and never share it.',
  });
}

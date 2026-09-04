import axios from 'axios';
import { env } from '../config/env.js';

/**
 * Brevo (ex-Sendinblue) transactional email.
 *
 * Two rules the rest of the app depends on:
 *  1. Without BREVO_API_KEY nothing hits the network — the send is logged and
 *     resolves successfully, so local/dev runs never fail because of email.
 *  2. Controllers always use `safeSend`, which cannot throw. Email is a
 *     side-effect of a request, never a reason to fail one.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 900;
const DEFAULT_SENDER_EMAIL = 'no-reply@gatepass.local';
const DEFAULT_SENDER_NAME = 'GatePass';

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function normaliseRecipients(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    if (!entry) continue;
    const email = (typeof entry === 'string' ? entry : String(entry.email ?? '')).trim();
    if (!email || !email.includes('@')) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = typeof entry === 'string' ? '' : String(entry.name ?? '').trim();
    out.push(name ? { email, name } : { email });
  }
  return out;
}

function normaliseAttachments(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const entry of list) {
    if (!entry) continue;
    const name = String(entry.name ?? '').trim();
    const content = String(entry.contentBase64 ?? entry.content ?? '').trim();
    if (!name || !content) continue;
    out.push({ name, content });
  }
  return out;
}

function htmlToText(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isRetryable(err) {
  const status = err?.response?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  // no response at all: timeout, DNS, socket reset — worth exactly one retry
  return true;
}

function describeError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const detail =
    (data && (data.message || data.error || data.code)) ||
    (typeof data === 'string' ? data.slice(0, 200) : '') ||
    err?.message ||
    'unknown error';
  return status ? `Brevo responded ${status}: ${detail}` : `Brevo request failed: ${detail}`;
}

/**
 * Send one transactional email.
 *
 * @param {object} payload
 * @param {Array<{email:string,name?:string}>|string} payload.to
 * @param {string} payload.subject
 * @param {string} [payload.html]
 * @param {string} [payload.text]
 * @param {Array<{name:string,contentBase64:string}>} [payload.attachments]
 * @param {Array<{email:string,name?:string}>|string} [payload.cc]
 * @returns {Promise<{ok:true, id?:string|null, dryRun?:true}>}
 * @throws {Error} when Brevo rejects the send (callers should prefer safeSend)
 */
export async function sendEmail({ to, subject, html, text, attachments, cc } = {}) {
  const recipients = normaliseRecipients(to);
  const ccRecipients = normaliseRecipients(cc);
  const attachment = normaliseAttachments(attachments);
  const subjectLine = String(subject ?? '').trim() || 'GatePass notification';

  if (!recipients.length) {
    throw new Error('sendEmail requires at least one valid recipient');
  }

  const htmlContent =
    typeof html === 'string' && html.trim()
      ? html
      : `<p>${String(text ?? subjectLine).replace(/\n/g, '<br />')}</p>`;
  const textContent =
    typeof text === 'string' && text.trim() ? text : htmlToText(htmlContent) || subjectLine;

  const apiKey = String((env && env.BREVO_API_KEY) || '').trim();

  if (!apiKey) {
    const parts = [
      `to=${recipients.map((r) => r.email).join(',')}`,
      ccRecipients.length ? `cc=${ccRecipients.map((r) => r.email).join(',')}` : '',
      `subject="${subjectLine}"`,
      attachment.length ? `attachments=${attachment.map((a) => a.name).join(',')}` : '',
    ].filter(Boolean);
    console.log(`[mailer:dry-run] ${parts.join(' ')}`);
    return { ok: true, dryRun: true };
  }

  const body = {
    sender: {
      email: String((env && env.BREVO_SENDER_EMAIL) || DEFAULT_SENDER_EMAIL),
      name: String((env && env.BREVO_SENDER_NAME) || DEFAULT_SENDER_NAME),
    },
    to: recipients,
    subject: subjectLine,
    htmlContent,
    textContent,
  };
  if (ccRecipients.length) body.cc = ccRecipients;
  if (attachment.length) body.attachment = attachment;

  const headers = {
    'api-key': apiKey,
    'content-type': 'application/json',
    accept: 'application/json',
  };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await axios.post(BREVO_ENDPOINT, body, {
        headers,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      const data = res?.data || {};
      const id = data.messageId || (Array.isArray(data.messageIds) ? data.messageIds[0] : null);
      return { ok: true, id: id || null };
    } catch (err) {
      lastError = err;
      if (attempt === 0 && isRetryable(err)) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  throw new Error(describeError(lastError));
}

/**
 * Fire-and-forget wrapper used by every controller. Never throws.
 * @param {object} payload same shape as sendEmail
 * @returns {Promise<boolean>} true when the email was accepted (or dry-run)
 */
export async function safeSend(payload) {
  try {
    const result = await sendEmail(payload);
    return Boolean(result && result.ok);
  } catch (err) {
    const subjectLine = String(payload?.subject ?? '').trim() || '(no subject)';
    console.warn(`[mailer:failed] subject="${subjectLine}" error=${err?.message || err}`);
    return false;
  }
}

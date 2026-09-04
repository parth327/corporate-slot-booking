import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/error.js';

/**
 * Gate pass QR helpers.
 *
 * The QR payload is a signed JWT with NO expiry — a gate pass is valid for a
 * single calendar date and the server re-checks that date (and the meeting
 * window) at scan time. Baking an `exp` into the token would only duplicate
 * that check with worse error messages.
 */

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GATEPASS_TYP = 'gatepass';
const RESCHEDULE_TYP = 'reschedule';
const RESCHEDULE_TTL = '30d';
const INVALID_QR_MESSAGE = 'Invalid or unrecognised QR code';
const INVALID_LINK_MESSAGE = 'This reschedule link is invalid or has expired';

function qrSecret() {
  const secret = (env && (env.QR_SECRET || env.JWT_SECRET)) || '';
  if (!secret) {
    throw ApiError.internal('QR signing secret is not configured (set QR_SECRET or JWT_SECRET)');
  }
  return secret;
}

function toGatepassId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Sign the QR payload for a gate pass.
 * @param {number} gatepassId
 * @param {string} [nonce] random per-issue value so re-issuing produces a new token
 * @returns {string} JWT
 */
export function signGatepassToken(gatepassId, nonce) {
  const gid = toGatepassId(gatepassId);
  if (gid === null) {
    throw ApiError.internal('signGatepassToken requires a positive numeric gatepass id');
  }
  const value =
    typeof nonce === 'string' && nonce.trim() ? nonce.trim() : crypto.randomBytes(9).toString('hex');
  return jwt.sign({ gid, nonce: value, typ: GATEPASS_TYP }, qrSecret(), { algorithm: 'HS256' });
}

/**
 * Verify a scanned QR payload.
 * @param {string} token
 * @returns {{ gid: number, nonce: string }}
 * @throws {ApiError} 400 INVALID_QR
 */
export function verifyGatepassToken(token) {
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) throw ApiError.invalidQr(INVALID_QR_MESSAGE);

  const secret = qrSecret();
  let payload;
  try {
    payload = jwt.verify(raw, secret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.invalidQr(INVALID_QR_MESSAGE);
  }

  const gid = payload ? toGatepassId(payload.gid) : null;
  if (!payload || payload.typ !== GATEPASS_TYP || gid === null) {
    throw ApiError.invalidQr(INVALID_QR_MESSAGE);
  }
  return { gid, nonce: typeof payload.nonce === 'string' ? payload.nonce : '' };
}

/**
 * Sign the token embedded in the public "propose a new time" link.
 * @param {number} gatepassId
 * @returns {string} JWT valid for 30 days
 */
export function signRescheduleToken(gatepassId) {
  const gid = toGatepassId(gatepassId);
  if (gid === null) {
    throw ApiError.internal('signRescheduleToken requires a positive numeric gatepass id');
  }
  return jwt.sign({ gid, typ: RESCHEDULE_TYP }, qrSecret(), {
    algorithm: 'HS256',
    expiresIn: RESCHEDULE_TTL,
  });
}

/**
 * Verify a public reschedule link token.
 * @param {string} token
 * @returns {{ gid: number }}
 * @throws {ApiError} 400 VALIDATION_ERROR
 */
export function verifyRescheduleToken(token) {
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) throw ApiError.badRequest(INVALID_LINK_MESSAGE);

  const secret = qrSecret();
  let payload;
  try {
    payload = jwt.verify(raw, secret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.badRequest(INVALID_LINK_MESSAGE);
  }

  const gid = payload ? toGatepassId(payload.gid) : null;
  if (!payload || payload.typ !== RESCHEDULE_TYP || gid === null) {
    throw ApiError.badRequest(INVALID_LINK_MESSAGE);
  }
  return { gid };
}

/**
 * Human-typeable fallback code. Alphabet excludes O/0 and I/1 so it can be
 * read out over a desk without ambiguity.
 * @param {number} [len=8]
 * @returns {string} uppercase code
 */
export function makeShortCode(len = 8) {
  const size = Number.isInteger(len) && len > 0 ? Math.min(len, 32) : 8;
  let out = '';
  for (let i = 0; i < size; i += 1) {
    out += SHORT_CODE_ALPHABET[crypto.randomInt(0, SHORT_CODE_ALPHABET.length)];
  }
  return out;
}

const QR_RENDER_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 440,
  color: { dark: '#0d1220', light: '#ffffff' },
};

/**
 * Render any text (normally the signed gate pass token) as a PNG data URL.
 *
 * NOTE: Gmail and Outlook strip `data:` URIs from `<img src>` in HTML email —
 * a data URI here is directly visible only in clients that still allow it
 * (Apple Mail, most desktop clients). For mail, use {@link renderQrBuffer}
 * either as a real attachment or served back through a public URL instead.
 *
 * @param {string} text
 * @returns {Promise<string>} 'data:image/png;base64,...'
 */
export async function renderQrDataUrl(text) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  if (!value) throw ApiError.internal('renderQrDataUrl requires a non-empty payload');
  try {
    return await QRCode.toDataURL(value, QR_RENDER_OPTIONS);
  } catch (err) {
    throw ApiError.internal(`Failed to render QR code: ${err?.message || 'unknown error'}`);
  }
}

/**
 * Render any text as a raw PNG buffer — for a real email attachment, or for
 * an endpoint that serves the image back over HTTP so it can be referenced
 * by a normal `<img src="https://...">` in mail (the one embedding method
 * every major webmail client actually renders).
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function renderQrBuffer(text) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  if (!value) throw ApiError.internal('renderQrBuffer requires a non-empty payload');
  try {
    return await QRCode.toBuffer(value, QR_RENDER_OPTIONS);
  } catch (err) {
    throw ApiError.internal(`Failed to render QR code: ${err?.message || 'unknown error'}`);
  }
}

/**
 * GatePass — error type + terminal error middleware.
 *
 * Every failure leaves the API in the shape docs/CONTRACT.md section 4 pins down:
 *   { "error": "Human readable message", "code": "MACHINE_CODE", "details": {...}? }
 */
import { randomBytes } from 'node:crypto';
import env from '../config/env.js';

/** Machine codes the contract allows. */
export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ROOM_CONFLICT: 'ROOM_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  INVALID_QR: 'INVALID_QR',
  DUPLICATE: 'DUPLICATE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
});

/**
 * An error that is safe to show a client verbatim.
 */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message human readable message
   * @param {string} [code] machine code from ERROR_CODES
   * @param {object|null} [details] extra machine-readable context
   */
  constructor(status, message, code, details) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = Number.isInteger(status) ? status : 500;
    this.code = code || defaultCodeForStatus(this.status);
    this.details = details ?? undefined;
    this.expose = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  /** 400 VALIDATION_ERROR */
  static badRequest(message, details) {
    return new ApiError(400, message || 'Invalid request.', ERROR_CODES.VALIDATION_ERROR, details);
  }

  /** 401 UNAUTHORIZED */
  static unauthorized(message) {
    return new ApiError(401, message || 'Authentication required.', ERROR_CODES.UNAUTHORIZED);
  }

  /** 403 FORBIDDEN */
  static forbidden(message) {
    return new ApiError(403, message || 'You do not have access to this resource.', ERROR_CODES.FORBIDDEN);
  }

  /** 404 NOT_FOUND */
  static notFound(message) {
    return new ApiError(404, message || 'Not found.', ERROR_CODES.NOT_FOUND);
  }

  /** 409 — code defaults to INVALID_STATE, pass 'ROOM_CONFLICT'/'DUPLICATE' when apt. */
  static conflict(message, code, details) {
    return new ApiError(409, message || 'Conflicting request.', code || ERROR_CODES.INVALID_STATE, details);
  }

  /** 400 INVALID_QR */
  static invalidQr(message) {
    return new ApiError(400, message || 'This gate pass code is not valid.', ERROR_CODES.INVALID_QR);
  }

  /** 500 INTERNAL */
  static internal(message) {
    return new ApiError(500, message || 'Something went wrong on our side.', ERROR_CODES.INTERNAL);
  }
}

/** Fallback machine code when a status has no explicit one. */
function defaultCodeForStatus(status) {
  switch (status) {
    case 400: return ERROR_CODES.VALIDATION_ERROR;
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.NOT_FOUND;
    case 409: return ERROR_CODES.INVALID_STATE;
    case 429: return ERROR_CODES.RATE_LIMITED;
    default: return status >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.VALIDATION_ERROR;
  }
}

/** Short correlation id printed in the log line and echoed to the client on 5xx. */
function shortId() {
  return randomBytes(4).toString('hex');
}

/** Postgres SQLSTATE codes look like '23505' / '22P02'. */
function isPgError(err) {
  return typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && ('severity' in err || 'routine' in err || 'schema' in err || 'table' in err);
}

/** Pulls a friendly column name out of a pg unique-violation detail line. */
function duplicateSubject(err) {
  const detail = typeof err?.detail === 'string' ? err.detail : '';
  // Detail looks like: Key (lower(email))=(a@b.com) already exists.
  const match = /^Key \((.+)\)=\(/.exec(detail);
  if (!match) return null;
  return match[1]
    .replace(/lower\(([a-z_]+)(?:::text)?\)/gi, '$1')
    .split(',')
    .map((part) => part.trim().replace(/_/g, ' '))
    .join(' + ');
}

/**
 * Translates a driver/framework error into an ApiError. Returns null when the
 * error is not one we recognise (caller treats it as a 500).
 * @param {any} err
 * @returns {ApiError|null}
 */
function translateKnownError(err) {
  if (err instanceof ApiError) return err;

  // body-parser
  if (err?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return new ApiError(413, 'Request body is too large.', ERROR_CODES.VALIDATION_ERROR);
  }

  if (isPgError(err)) {
    switch (err.code) {
      case '23505': {
        const subject = duplicateSubject(err);
        return ApiError.conflict(
          subject ? `That ${subject} is already in use.` : 'That record already exists.',
          ERROR_CODES.DUPLICATE,
        );
      }
      case '23503':
        return ApiError.badRequest('A referenced record does not exist, or is still in use elsewhere.');
      case '23502':
        return ApiError.badRequest('A required field is missing.');
      case '23514':
        return ApiError.badRequest('A value in the request is out of the allowed range.');
      case '22P02':
      case '22007':
      case '22008':
        return ApiError.badRequest('A value in the request is malformed.');
      case '22001':
        return ApiError.badRequest('A value in the request is too long.');
      default:
        return null;
    }
  }

  // Anything that already carries a sane client status (e.g. thrown by express).
  const status = Number(err?.status || err?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return new ApiError(status, err?.message || 'Request failed.', err?.code);
  }

  return null;
}

/**
 * Terminal express error handler. Must be registered last.
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // The response is already streaming; hand it back to express to abort it.
    next(err);
    return;
  }

  const apiError = translateKnownError(err);
  const status = apiError ? apiError.status : Number(err?.status) || 500;
  const id = shortId();

  if (status >= 500) {
    console.error(
      `[error] ${id} ${req.method} ${req.originalUrl || req.url} -> ${status} :: ${err?.message || err}`,
    );
    if (!env.isProd && err?.stack) console.error(err.stack);

    const body = {
      error: env.isProd ? 'Something went wrong on our side.' : String(err?.message || 'Internal server error'),
      code: (apiError && apiError.code) || ERROR_CODES.INTERNAL,
      details: { ref: id },
    };
    if (!env.isProd && err?.stack) body.details.stack = String(err.stack).split('\n').slice(0, 6);
    res.status(status).json(body);
    return;
  }

  const safe = apiError || new ApiError(status, 'Request failed.');
  const body = { error: safe.message, code: safe.code };
  if (safe.details !== undefined && safe.details !== null) body.details = safe.details;
  res.status(safe.status).json(body);
}

/**
 * 404 handler for unmatched routes. Register after all routers, before
 * {@link errorHandler}.
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl || req.url}`));
}

export default ApiError;

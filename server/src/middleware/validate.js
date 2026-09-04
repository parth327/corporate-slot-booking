/**
 * GatePass — hand-rolled request validation (no external validation library,
 * per docs/CONTRACT.md section 4).
 *
 *   router.post('/x', validate({ email: v.email({ required: true }) }), handler)
 *
 * On success the middleware REPLACES `req[source]` with the cleaned, coerced
 * object: unknown keys are dropped, strings trimmed, numbers/booleans coerced
 * out of their query-string spellings, times normalised to 'HH:mm'.
 *
 * On failure it throws
 *   ApiError.badRequest('Validation failed', { fields: { field: 'reason' } })
 * with EVERY offending field reported, not just the first.
 *
 * Presence semantics (important for partial PUT bodies):
 *   - key absent          -> omitted from the result (no error unless required)
 *   - key present as null
 *     or empty string     -> null in the result (error when required)
 */
import { ApiError } from './error.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Two-digit zero padding. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** A rule descriptor factory shared by every builder. */
function rule(kind, opts = {}) {
  return { kind, ...opts };
}

/**
 * Rule builders. Each returns a plain descriptor object consumed by
 * {@link validate}; they perform no work themselves.
 */
export const v = {
  /** @param {{required?:boolean,min?:number,max?:number,trim?:boolean,lower?:boolean,pattern?:RegExp,enum?:string[]}} [opts] */
  string: (opts = {}) => rule('string', { trim: true, ...opts }),
  /** Lowercased + trimmed email address. */
  email: (opts = {}) => rule('email', opts),
  /** Integer; numeric strings from query params are coerced. */
  int: (opts = {}) => rule('int', opts),
  /** Boolean; 'true'/'false'/'1'/'0'/'yes'/'no'/'on'/'off' are coerced. */
  bool: (opts = {}) => rule('bool', opts),
  /** Calendar date 'YYYY-MM-DD'; impossible dates such as 2026-02-31 are rejected. */
  date: (opts = {}) => rule('date', opts),
  /** 'HH:mm' or 'HH:mm:ss' in, always 'HH:mm' out. */
  time: (opts = {}) => rule('time', opts),
  /** 7..15 digits, optional leading '+'; separators are stripped. */
  phone: (opts = {}) => rule('phone', opts),
  /** One of `values`. */
  enum: (values, opts = {}) => rule('enum', { values: Array.isArray(values) ? values : [], ...opts }),
};

// --- coercers -----------------------------------------------------------------
// Each returns { value } on success or { error: 'reason' } on failure.

function coerceString(raw, opts) {
  let value = typeof raw === 'string' ? raw : String(raw);
  if (opts.trim !== false) value = value.trim();
  if (opts.lower) value = value.toLowerCase();
  if (opts.min !== undefined && value.length < opts.min) {
    return { error: `must be at least ${opts.min} character${opts.min === 1 ? '' : 's'}` };
  }
  if (opts.max !== undefined && value.length > opts.max) {
    return { error: `must be at most ${opts.max} characters` };
  }
  if (opts.pattern instanceof RegExp && !opts.pattern.test(value)) {
    return { error: 'has an invalid format' };
  }
  if (Array.isArray(opts.enum) && opts.enum.length > 0 && !opts.enum.includes(value)) {
    return { error: `must be one of: ${opts.enum.join(', ')}` };
  }
  return { value };
}

function coerceEmail(raw) {
  const value = String(raw).trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 254) {
    return { error: 'must be a valid email address' };
  }
  return { value };
}

function coerceInt(raw, opts) {
  if (typeof raw === 'boolean') return { error: 'must be a whole number' };
  const num = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { error: 'must be a whole number' };
  }
  if (opts.min !== undefined && num < opts.min) return { error: `must be ${opts.min} or more` };
  if (opts.max !== undefined && num > opts.max) return { error: `must be ${opts.max} or less` };
  return { value: num };
}

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', 'on']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'n', 'off']);

function coerceBool(raw) {
  if (typeof raw === 'boolean') return { value: raw };
  if (raw === 1) return { value: true };
  if (raw === 0) return { value: false };
  const word = String(raw).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return { value: true };
  if (FALSE_WORDS.has(word)) return { value: false };
  return { error: 'must be true or false' };
}

function coerceDate(raw) {
  let text;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { error: 'must be a valid date in YYYY-MM-DD format' };
    text = `${raw.getUTCFullYear()}-${pad2(raw.getUTCMonth() + 1)}-${pad2(raw.getUTCDate())}`;
  } else {
    text = String(raw).trim();
  }
  const match = DATE_RE.exec(text);
  if (!match) return { error: 'must be a valid date in YYYY-MM-DD format' };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { error: 'must be a real calendar date' };
  }
  // Round-trip through UTC to reject 2026-02-31, 2025-02-29 and friends.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { error: 'must be a real calendar date' };
  }
  return { value: `${match[1]}-${match[2]}-${match[3]}` };
}

function coerceTime(raw) {
  const match = TIME_RE.exec(String(raw).trim());
  if (!match) return { error: 'must be a time in HH:mm format' };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return { error: 'must be a real time of day' };
  }
  return { value: `${pad2(hours)}:${pad2(minutes)}` };
}

function coercePhone(raw) {
  const text = String(raw).trim();
  if (!/^[+]?[\d\s()\-.]+$/.test(text)) {
    return { error: 'must be a valid phone number' };
  }
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { error: 'must have between 7 and 15 digits' };
  }
  return { value: text.startsWith('+') ? `+${digits}` : digits };
}

function coerceEnum(raw, opts) {
  const value = String(raw).trim();
  if (!opts.values.includes(value)) {
    return { error: `must be one of: ${opts.values.join(', ')}` };
  }
  return { value };
}

const COERCERS = {
  string: coerceString,
  email: coerceEmail,
  int: coerceInt,
  bool: coerceBool,
  date: coerceDate,
  time: coerceTime,
  phone: coercePhone,
  enum: coerceEnum,
};

/** True for values that count as "supplied but blank". */
function isBlank(raw, ruleDef) {
  if (raw === null) return true;
  if (typeof raw !== 'string') return false;
  return (ruleDef.kind === 'string' && ruleDef.trim === false ? raw : raw.trim()) === '';
}

/**
 * Runs a schema against a plain object.
 * @param {Record<string, object>} schema
 * @param {Record<string, any>} input
 * @returns {{ value: Record<string, any>, errors: Record<string, string> }}
 */
export function applySchema(schema, input) {
  const value = {};
  const errors = {};
  const source = input && typeof input === 'object' ? input : {};

  for (const [key, ruleDef] of Object.entries(schema)) {
    if (!ruleDef || typeof ruleDef !== 'object' || !COERCERS[ruleDef.kind]) {
      errors[key] = 'has no valid validation rule';
      continue;
    }

    const raw = source[key];

    if (raw === undefined) {
      if (ruleDef.required) errors[key] = 'is required';
      continue;
    }

    if (isBlank(raw, ruleDef)) {
      if (ruleDef.required) errors[key] = 'is required';
      else value[key] = null;
      continue;
    }

    if (typeof raw === 'object') {
      errors[key] = 'must be a single value';
      continue;
    }

    const result = COERCERS[ruleDef.kind](raw, ruleDef);
    if (result.error) errors[key] = result.error;
    else value[key] = result.value;
  }

  return { value, errors };
}

/**
 * Express middleware factory.
 * @param {Record<string, object>} schema map of field -> rule descriptor from {@link v}
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  if (!schema || typeof schema !== 'object') {
    throw new TypeError('validate(schema): schema must be an object of rules');
  }
  return function validateMiddleware(req, res, next) {
    try {
      const { value, errors } = applySchema(schema, req[source]);
      if (Object.keys(errors).length > 0) {
        throw ApiError.badRequest('Validation failed', { fields: errors });
      }
      req[source] = value;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export default validate;

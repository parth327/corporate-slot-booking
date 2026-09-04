/**
 * GatePass — environment configuration.
 *
 * Loads `server/.env` (resolved relative to THIS module, never process.cwd()) and
 * exposes a single frozen, fully coerced config object. Nothing in here ever calls
 * process.exit(): the entry point calls `assertRequiredEnv()` and decides what to do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path of the `server/` directory (src/config -> src -> server). */
export const SERVER_ROOT = path.resolve(__dirname, '..', '..');
/** Absolute path of the dotenv file we load. */
export const ENV_FILE = path.join(SERVER_ROOT, '.env');
/** Absolute path of the template we point users at when config is missing. */
export const ENV_EXAMPLE_FILE = path.join(SERVER_ROOT, '.env.example');

if (fs.existsSync(ENV_FILE)) {
  dotenv.config({ path: ENV_FILE });
} else {
  // Still honour a pre-populated process.env (Docker, CI, Render, Neon, ...).
  dotenv.config();
}

/** Trimmed string or the fallback when unset/blank. */
function str(name, fallback = '') {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  const trimmed = String(raw).trim();
  return trimmed === '' ? fallback : trimmed;
}

/** Integer with a numeric fallback; non-numeric values fall back rather than NaN. */
function num(name, fallback) {
  const raw = str(name, '');
  if (raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/** Boolean from the usual textual spellings. */
function bool(name, fallback) {
  const raw = str(name, '').toLowerCase();
  if (raw === '') return fallback;
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
}

/** Drop a trailing slash so link building can always use `${APP_URL}/path`. */
function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.replace(/\/+$/, '') : value;
}

const NODE_ENV = str('NODE_ENV', 'development');
const JWT_SECRET = str('JWT_SECRET', '');
const rawOffset = num('TZ_OFFSET_MINUTES', 330);
// Real-world UTC offsets live between -12:00 and +14:00.
const TZ_OFFSET_MINUTES = Math.min(840, Math.max(-720, rawOffset));

export const env = Object.freeze({
  DATABASE_URL: str('DATABASE_URL', ''),
  JWT_SECRET,
  QR_SECRET: str('QR_SECRET', '') || JWT_SECRET,
  BREVO_API_KEY: str('BREVO_API_KEY', ''),
  BREVO_SENDER_EMAIL: str('BREVO_SENDER_EMAIL', 'no-reply@gatepass.local'),
  BREVO_SENDER_NAME: str('BREVO_SENDER_NAME', 'GatePass'),
  PORT: num('PORT', 4000),
  NODE_ENV,
  CORS_ORIGIN: str('CORS_ORIGIN', '*'),
  APP_URL: trimTrailingSlash(str('APP_URL', 'http://localhost:5173')),
  TZ_OFFSET_MINUTES,
  ENABLE_CRON: bool('ENABLE_CRON', true),
  SEED_ADMIN_EMAIL: str('SEED_ADMIN_EMAIL', 'admin@gatepass.local').toLowerCase(),
  SEED_ADMIN_PASSWORD: str('SEED_ADMIN_PASSWORD', 'Admin@123'),
  SEED_DEMO_DATA: bool('SEED_DEMO_DATA', false),
  isProd: NODE_ENV === 'production',
});

/** Config keys the server genuinely cannot boot without. */
const REQUIRED_KEYS = [
  ['DATABASE_URL', 'Postgres connection string (Neon: use the pooled URL with sslmode=require).'],
  ['JWT_SECRET', 'HS256 signing key for login sessions. Generate one with:\n      node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'],
];

/**
 * Throws a descriptive, actionable Error when required configuration is missing.
 * Never exits the process — the caller (src/index.js) decides.
 * @returns {typeof env} the validated config, so callers can chain.
 */
export function assertRequiredEnv() {
  const missing = REQUIRED_KEYS.filter(([key]) => !env[key]);
  if (missing.length === 0) return env;

  const lines = [
    'GatePass cannot start: required environment variables are missing.',
    '',
    ...missing.map(([key, hint]) => `  - ${key}\n      ${hint}`),
    '',
    `Expected dotenv file : ${ENV_FILE}${fs.existsSync(ENV_FILE) ? '' : '   (not found)'}`,
    `Template to copy from: ${ENV_EXAMPLE_FILE}`,
    '',
    'Fix it with:',
    '  cp server/.env.example server/.env      # then fill in the values above',
    '',
    'See docs/CONTRACT.md section 1 for the full variable reference.',
  ];
  throw new Error(lines.join('\n'));
}

/** Alias of {@link assertRequiredEnv} for call sites that prefer the shorter name. */
export function validateEnv() {
  return assertRequiredEnv();
}

export default env;

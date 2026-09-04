/**
 * GatePass — schema migration runner.
 *
 * Reads `schema.sql` from next to this module (never process.cwd(), so `npm run
 * migrate` works from any directory) and applies it inside a single transaction.
 * The file is split on `-- >>> STEP:` marker lines purely so each chunk can be
 * logged; the whole thing still commits or rolls back as one unit.
 *
 * Usable as a library (`runMigrations()`) and as a CLI (`node src/db/migrate.js`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';
import { assertRequiredEnv } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path of the DDL file this runner applies. */
export const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const STEP_MARKER = /^--\s*>>>\s*STEP:\s*(.+)$/;

/**
 * Splits the DDL into `{ name, sql }` chunks on `-- >>> STEP:` lines.
 * Chunks that contain nothing but comments/whitespace are dropped.
 * @param {string} sql
 * @returns {Array<{ name: string, sql: string }>}
 */
function splitSteps(sql) {
  const steps = [];
  let current = { name: 'schema', lines: [] };

  for (const line of sql.split(/\r?\n/)) {
    const match = STEP_MARKER.exec(line.trim());
    if (match) {
      steps.push(current);
      current = { name: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  steps.push(current);

  return steps
    .map((step) => ({ name: step.name, sql: step.lines.join('\n') }))
    .filter((step) => step.sql.replace(/--[^\n]*/g, '').trim().length > 0);
}

/**
 * Applies `schema.sql`. Idempotent — safe to call on every boot.
 * @returns {Promise<{ steps: number, durationMs: number }>}
 */
export async function runMigrations() {
  const startedAt = Date.now();
  const sql = await fs.readFile(SCHEMA_PATH, 'utf8');
  const steps = splitSteps(sql);

  console.log(`[migrate] applying schema (${steps.length} steps) from ${SCHEMA_PATH}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [index, step] of steps.entries()) {
      const label = `${String(index + 1).padStart(2, '0')}/${steps.length} ${step.name}`;
      const stepStartedAt = Date.now();
      await client.query(step.sql);
      console.log(`[migrate]   ok ${label} (${Date.now() - stepStartedAt}ms)`);
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[migrate] rollback failed:', rollbackErr?.message || rollbackErr);
    }
    console.error('[migrate] FAILED — no schema changes were applied.');
    throw err;
  } finally {
    client.release();
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[migrate] schema is up to date (${durationMs}ms)`);
  return { steps: steps.length, durationMs };
}

/** True when this module was started directly by node, rather than imported. */
function isCliInvocation() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(__filename);
  } catch {
    return false;
  }
}

if (isCliInvocation()) {
  try {
    assertRequiredEnv();
    await runMigrations();
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error(`[migrate] ${err?.message || err}`);
    await closePool();
    process.exit(1);
  }
}

export default runMigrations;

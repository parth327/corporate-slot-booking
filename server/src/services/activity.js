/**
 * GatePass — audit trail.
 *
 * Writes to `activity_logs`. Audit logging is best-effort by design: neither
 * function ever throws, so a logging failure can never turn a successful request
 * into a 500. Failures are reported with console.warn.
 */
import { pool } from '../db/pool.js';

const INSERT_SQL = `
  INSERT INTO activity_logs (user_id, actor_label, action, entity_type, entity_id, meta, ip)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`;

/** Positive integer or null — activity_logs.user_id / entity_id are nullable. */
function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

/** Trimmed string capped at `max`, or null. */
function toTextOrNull(value, max = 200) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  return text.length > max ? text.slice(0, max) : text;
}

/** Strips the IPv4-mapped IPv6 prefix express hands us. */
function toIpOrNull(value) {
  const text = toTextOrNull(value, 64);
  return text ? text.replace(/^::ffff:/, '') : null;
}

/** JSONB payload as a string, or null. Circular/unserialisable meta degrades gracefully. */
function toJsonOrNull(meta) {
  if (meta === null || meta === undefined) return null;
  try {
    const json = JSON.stringify(meta);
    return json === undefined ? null : json;
  } catch {
    return JSON.stringify({ unserializable: true });
  }
}

/** Builds the ordered parameter list shared by both writers. */
function toParams({ userId, actorLabel, action, entityType, entityId, meta, ip }) {
  return [
    toIntOrNull(userId),
    toTextOrNull(actorLabel, 120),
    toTextOrNull(action, 80),
    toTextOrNull(entityType, 60),
    toIntOrNull(entityId),
    toJsonOrNull(meta),
    toIpOrNull(ip),
  ];
}

/**
 * Records an activity entry on a pooled connection. Never throws.
 * @param {{ userId?: number|null, actorLabel?: string|null, action: string,
 *           entityType?: string|null, entityId?: number|null,
 *           meta?: object|null, ip?: string|null }} entry
 * @returns {Promise<void>}
 */
export async function logActivity(entry = {}) {
  const params = toParams(entry);
  if (!params[2]) {
    console.warn('[activity] skipped: `action` is required');
    return;
  }
  try {
    await pool.query(INSERT_SQL, params);
  } catch (err) {
    console.warn(`[activity] failed to record ${params[2]}: ${err?.message || err}`);
  }
}

/**
 * Same as {@link logActivity} but on an existing transaction client, so the audit
 * row commits or rolls back with the write it describes. Never throws.
 *
 * The insert is wrapped in a SAVEPOINT: in Postgres any failed statement poisons
 * the whole transaction, so swallowing the error alone would break every query
 * that follows. Rolling back to the savepoint keeps the caller's work intact.
 * @param {import('pg').PoolClient} client
 * @param {Parameters<typeof logActivity>[0]} entry
 * @returns {Promise<void>}
 */
export async function logActivityTx(client, entry = {}) {
  if (!client || typeof client.query !== 'function') {
    return logActivity(entry);
  }
  const params = toParams(entry);
  if (!params[2]) {
    console.warn('[activity] skipped: `action` is required');
    return;
  }

  const SAVEPOINT = 'gatepass_activity_log';
  let savepointOpen = false;
  try {
    await client.query(`SAVEPOINT ${SAVEPOINT}`);
    savepointOpen = true;
  } catch {
    // Not inside a transaction block — fall through to a plain insert.
  }

  try {
    await client.query(INSERT_SQL, params);
    if (savepointOpen) await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
  } catch (err) {
    if (savepointOpen) {
      try {
        await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      } catch (rollbackErr) {
        console.warn(`[activity] savepoint rollback failed: ${rollbackErr?.message || rollbackErr}`);
      }
    }
    console.warn(`[activity] failed to record ${params[2]} in transaction: ${err?.message || err}`);
  }
}

export default logActivity;

/**
 * GatePass — Postgres connection pool.
 *
 * Single shared `pg.Pool` for the whole process. Reads use `query()`, any
 * multi-statement write uses `withTransaction()`.
 */
import dns from 'node:dns';
import pgPkg from 'pg';
import env from '../config/env.js';
import { pinnedResolve, startBackgroundRefresh } from './dnsCache.js';

const { Pool, types } = pgPkg;

// Hosted Postgres endpoints publish both A and AAAA records. On hosts without a
// working IPv6 route Node's default ordering picks the AAAA answer roughly half
// the time and the connection fails intermittently, which looks like a flaky
// database rather than a broken route. Prefer IPv4 and the failure disappears.
dns.setDefaultResultOrder('ipv4first');

// --- type parsers -------------------------------------------------------------
// DATE (oid 1082): keep the raw 'YYYY-MM-DD' string. The default parser builds a
// JS Date at *local* midnight, which silently shifts the day across timezones —
// fatal for `requested_date`, which the contract pins to 'YYYY-MM-DD'.
types.setTypeParser(1082, (value) => value);
// INT8 (oid 20): COUNT(*) etc. come back as JS numbers instead of strings, so
// `{ total }` in list responses is a number as the contract requires.
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

const isLoopbackHost = (host) =>
  host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local');

/** Neon (and every hosted PG) needs TLS; a local server generally does not. */
function requiresSsl(connectionString) {
  if (!connectionString) return false;
  if (/[?&]sslmode=disable/i.test(connectionString)) return false;
  try {
    return !isLoopbackHost(new URL(connectionString).hostname.toLowerCase());
  } catch {
    return !/(localhost|127\.0\.0\.1)/i.test(connectionString);
  }
}

const useSsl = requiresSsl(env.DATABASE_URL);

/**
 * Parsed once at boot, into the discrete fields `pg.Pool` accepts.
 *
 * Deliberately NOT passed as `connectionString`: pg's own config merging runs
 * `Object.assign({}, config, parse(config.connectionString))` — the parsed
 * string is applied *last* and would silently overwrite any pinned `host` we
 * set below on every single connection, undoing the whole point of pinning.
 */
function parseDatabaseUrl(raw) {
  const url = new URL(raw);
  return {
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

const parsed = parseDatabaseUrl(env.DATABASE_URL);

// `poolConfig.host` starts as the plain hostname and is upgraded to a pinned IP
// address just below once the initial lookup completes — see the comment on
// `pinnedResolve`. Kept as one stable object so a later `host` mutation is seen
// by `pg-pool`'s `newClient()`, which reads `this.options` fresh on every
// connection (pg-pool shallow-clones the object we pass in at construction
// time, so the mutation target is `pool.options`, not this object, once the
// pool exists — see below).
const poolConfig = {
  host: parsed.hostname,
  port: parsed.port,
  user: parsed.user,
  password: parsed.password,
  database: parsed.database,
  // Neon terminates TLS with a chain Node does not ship; verification is disabled
  // deliberately, the connection itself is still encrypted. `servername` pins
  // TLS SNI to the real hostname so Neon's proxy still routes correctly once
  // `host` below becomes a bare IP address instead of the hostname.
  ssl: useSsl ? { rejectUnauthorized: false, servername: parsed.hostname } : false,
  // node-postgres defaults this to false. Without it, a pooled connection that
  // sits idle for a while over the WAN hop to Neon can be silently dropped by a
  // router/NAT box along the path — the socket looks fine to us until the next
  // query tries to use it, gets a dead connection, and has to reconnect from
  // scratch (the multi-second spikes seen in practice). TCP keepalive probes
  // detect that death in the background instead, before a real query hits it.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  max: 10,
  // Neon is a WAN hop away (TCP+TLS handshake alone costs 1.5-2.5s from here).
  // The previous 30s idle timeout meant any request arriving after a short
  // pause paid that cost again on a brand new connection. Most user activity
  // (clicking around a page, filling a form) fits inside a few minutes, so a
  // longer idle window keeps connections warm across normal gaps instead of
  // tearing them down between clicks. See also the keepalive ping below.
  idleTimeoutMillis: 600_000,
  connectionTimeoutMillis: 10000,
  application_name: 'gatepass-api',
};

export const pool = new Pool(poolConfig);

// An idle client dropped by the server must never take the process down.
pool.on('error', (err) => {
  console.error('[db] idle client error:', err?.message || err);
});

// Keeps one connection hot so the *next* request never pays a cold-connect
// penalty. Without this, a quiet period longer than idleTimeoutMillis (or a
// Neon-side idle disconnect, which node-postgres can't see coming) leaves the
// pool empty and the first request after the lull eats a fresh TCP+TLS
// handshake. `SELECT 1` is cheap and keeps a real client checked out just long
// enough to touch the wire, then released back to the pool.
const KEEPALIVE_INTERVAL_MS = 4 * 60_000;
let keepaliveTimer = null;

export function startKeepalive() {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    pool.query('SELECT 1').catch((err) => {
      console.warn('[db] keepalive ping failed:', err?.message || err);
    });
  }, KEEPALIVE_INTERVAL_MS);
  keepaliveTimer.unref();
}

export function stopKeepalive() {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

/**
 * Opens `count` real connections up front and leaves them checked into the
 * pool, so the first few requests after boot reuse an already-open,
 * already-authenticated connection instead of each independently paying a
 * fresh TCP+TLS handshake to Neon. Best-effort: a failure here just means
 * the pool warms up lazily as usual, same as before this existed.
 */
export async function warmPool(count = poolConfig.max) {
  const clients = [];
  try {
    await Promise.all(
      Array.from({ length: count }, () =>
        pool.connect().then((client) => clients.push(client))
      )
    );
  } catch (err) {
    console.warn(`[db] pool warm-up incomplete: ${err?.message || err}`);
  } finally {
    for (const client of clients) client.release();
  }
  console.log(`[db] warmed ${clients.length}/${count} pooled connections`);
}

// --- DNS pinning ----------------------------------------------------------------
// See dnsCache.js for the full rationale: without this, every new pooled
// connection re-resolves the hostname independently, and any resolver hiccup
// fails whichever request happens to be opening a connection at that instant
// — which reads as "the login sometimes fails" when the database is actually
// fine the whole time. Resolving once and reusing the address removes DNS from
// the request path entirely; the background refresh keeps it correct if the
// endpoint's IP ever changes.
if (useSsl) {
  pinnedResolve(parsed.hostname)
    .then((address) => {
      pool.options.host = address; // pg-pool's own copy — see parseDatabaseUrl's comment
    })
    .catch((err) => {
      // No address at all, not even a stale one — connections fall back to a
      // live per-connection lookup via the plain hostname, same as before this
      // change. waitForDatabase() below still covers a genuine outage.
      console.warn(`[db] initial DNS pin failed for ${parsed.hostname}: ${err.code || err.message}`);
    });

  startBackgroundRefresh(parsed.hostname, (address) => {
    console.log(`[db] endpoint address changed, now pinned to ${address}`);
    pool.options.host = address;
  });
}

/**
 * Parameterised query on a pooled client.
 * @param {string} text SQL with $1..$n placeholders
 * @param {Array<any>} [params]
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Runs `fn` inside BEGIN/COMMIT, rolling back on any throw. The client is always
 * released, success or failure.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[db] rollback failed:', rollbackErr?.message || rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cheap liveness probe used by GET /api/health.
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[db] health check failed:', err?.message || err);
    return false;
  }
}

/** Errors that mean "not reachable yet" rather than "wrong". */
const TRANSIENT = new Set([
  'ENOTFOUND',      // DNS not answering yet
  'EAI_AGAIN',      // temporary resolver failure
  'ECONNREFUSED',   // database still starting
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * Blocks until the database answers, or gives up.
 *
 * Boot order is DNS -> TLS -> Postgres, and any of the three can be a moment
 * behind the process itself (a cold serverless endpoint, a container starting
 * before its network is ready, a resolver blip). Retrying a handful of times
 * turns a crash loop into a short pause.
 *
 * @param {{retries?: number, delayMs?: number}} [options]
 * @returns {Promise<void>} rejects with the last error once the retries run out
 */
export async function waitForDatabase({ retries = 5, delayMs = 1500 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      const transient = TRANSIENT.has(err?.code);
      if (!transient || attempt === retries) break;
      console.warn(
        `[db] not reachable (${err.code}), retrying in ${delayMs}ms — attempt ${attempt}/${retries - 1}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/** Closes every pooled connection. Used by the migrate/seed CLIs and tests. */
export async function closePool() {
  try {
    await pool.end();
  } catch (err) {
    console.error('[db] pool shutdown failed:', err?.message || err);
  }
}

export default pool;

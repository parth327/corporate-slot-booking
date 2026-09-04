/**
 * GatePass — DNS pinning for the database host.
 *
 * Without this, every new pooled connection re-resolves the Neon hostname via
 * the OS resolver. On a resolver that is occasionally slow to answer, that
 * turns a one-second hiccup into a hard failure for whichever request happens
 * to open a fresh connection at that instant — which is exactly the
 * "sometimes it works, sometimes it doesn't" symptom: the database is fine,
 * a single DNS query just lost the coin flip.
 *
 * The fix is to resolve once, remember the address, and keep using it —
 * re-resolving on a timer in the background rather than on the request path.
 * A failed background refresh falls back to the last address that worked
 * instead of failing whatever request happens to be running.
 */
import dns from 'node:dns/promises';

const LOOKUP_RETRIES = 3;
const LOOKUP_RETRY_BASE_MS = 400;

/** hostname -> { address, resolvedAt } */
const cache = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupWithRetry(hostname) {
  let lastError;
  for (let attempt = 1; attempt <= LOOKUP_RETRIES; attempt += 1) {
    try {
      const { address } = await dns.lookup(hostname, { family: 4 });
      return address;
    } catch (err) {
      lastError = err;
      if (attempt < LOOKUP_RETRIES) await delay(LOOKUP_RETRY_BASE_MS * attempt);
    }
  }
  throw lastError;
}

/**
 * Resolves `hostname` to an IPv4 address, retrying briefly on failure and
 * falling back to the last address that worked when every retry fails.
 *
 * @param {string} hostname
 * @returns {Promise<string>} rejects only when there is no cached fallback
 */
export async function pinnedResolve(hostname) {
  try {
    const address = await lookupWithRetry(hostname);
    cache.set(hostname, { address, resolvedAt: Date.now() });
    return address;
  } catch (err) {
    const cached = cache.get(hostname);
    if (cached) {
      console.warn(
        `[dns] lookup failed for ${hostname} (${err.code || err.message}); reusing ${cached.address} from ${Math.round((Date.now() - cached.resolvedAt) / 1000)}s ago`
      );
      return cached.address;
    }
    throw err;
  }
}

/**
 * Re-resolves `hostname` on an interval and calls `onChange(newAddress)` only
 * when the resolved address actually differs from what is cached — a normal
 * refresh that returns the same IP is silent. A failed refresh is logged by
 * {@link pinnedResolve} and otherwise ignored; the last good address stands.
 *
 * @param {string} hostname
 * @param {(address: string) => void} onChange
 * @param {number} [intervalMs]
 * @returns {() => void} stops the refresh
 */
export function startBackgroundRefresh(hostname, onChange, intervalMs = 120_000) {
  const timer = setInterval(() => {
    const before = cache.get(hostname)?.address;
    pinnedResolve(hostname)
      .then((address) => {
        if (address !== before) onChange(address);
      })
      .catch(() => {
        /* pinnedResolve already logged; nothing new to do here */
      });
  }, intervalMs);
  timer.unref(); // must never keep the process alive on its own
  return () => clearInterval(timer);
}

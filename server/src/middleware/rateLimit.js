/**
 * GatePass — in-memory sliding-window rate limiter.
 *
 * Single-process only (no Redis in the stack). Good enough for the documented
 * use: 5 public gate-pass requests per 10 minutes per IP, and login throttling.
 *
 *   router.post('/request', rateLimit({ windowMs: 10 * 60_000, max: 5 }), handler)
 */
import { ApiError } from './error.js';

/** Normalises express' IPv4-mapped IPv6 addresses ('::ffff:1.2.3.4'). */
function defaultKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(ip).replace(/^::ffff:/, '');
}

/**
 * @param {object} [options]
 * @param {number} [options.windowMs=60000] sliding window width
 * @param {number} [options.max=60] hits allowed inside the window
 * @param {(req: import('express').Request) => string} [options.keyFn] bucket key
 * @param {string} [options.message] message used for the 429
 * @returns {import('express').RequestHandler}
 */
export default function rateLimit(options = {}) {
  const windowMs = Number.isFinite(options.windowMs) && options.windowMs > 0 ? Math.trunc(options.windowMs) : 60_000;
  const max = Number.isFinite(options.max) && options.max > 0 ? Math.trunc(options.max) : 60;
  const keyFn = typeof options.keyFn === 'function' ? options.keyFn : defaultKey;
  const message = options.message || 'Too many requests. Please slow down and try again shortly.';

  /** @type {Map<string, number[]>} key -> ascending hit timestamps inside the window */
  const buckets = new Map();

  /** Drops timestamps that fell out of the window; returns what is left. */
  function prune(key, now) {
    const cutoff = now - windowMs;
    const hits = buckets.get(key);
    if (!hits) return null;
    let firstLive = 0;
    while (firstLive < hits.length && hits[firstLive] <= cutoff) firstLive += 1;
    if (firstLive > 0) hits.splice(0, firstLive);
    if (hits.length === 0) {
      buckets.delete(key);
      return null;
    }
    return hits;
  }

  // Periodic sweep so idle keys cannot leak memory. unref() keeps the timer from
  // holding the event loop open, so the process can still exit cleanly.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const key of [...buckets.keys()]) prune(key, now);
  }, Math.min(windowMs, 60_000));
  sweep.unref?.();

  function middleware(req, res, next) {
    // The end-to-end suite drives dozens of requests from one address on purpose;
    // throttling it would only test the limiter. Production never sets this.
    if (process.env.NODE_ENV === 'test') return next();

    const now = Date.now();
    let key;
    try {
      key = String(keyFn(req) ?? 'unknown');
    } catch {
      key = 'unknown';
    }

    const hits = prune(key, now) || [];

    if (hits.length >= max) {
      const retryAfterMs = Math.max(0, hits[0] + windowMs - now);
      const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + retryAfterMs) / 1000)));
      next(new ApiError(429, message, 'RATE_LIMITED', { retry_after_seconds: retryAfterSeconds }));
      return;
    }

    hits.push(now);
    buckets.set(key, hits);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - hits.length)));
    next();
  }

  /** Test/ops hook: clears one key, or every key when called with no argument. */
  middleware.reset = (key) => {
    if (key === undefined) buckets.clear();
    else buckets.delete(String(key));
  };
  /** Stops the sweep timer (tests / graceful shutdown). */
  middleware.stop = () => clearInterval(sweep);

  return middleware;
}

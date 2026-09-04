/**
 * Conditional className joiner — a tiny clsx, so the UI kit has no extra dependency.
 * Accepts strings, arrays and objects: cn('a', ['b'], { c: true, d: false }) -> 'a b c'
 */
export default function cn(...args) {
  const out = [];
  for (const arg of args) {
    if (!arg) continue;
    if (typeof arg === 'string' || typeof arg === 'number') {
      out.push(String(arg));
    } else if (Array.isArray(arg)) {
      const nested = cn(...arg);
      if (nested) out.push(nested);
    } else if (typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg)) if (value) out.push(key);
    }
  }
  return out.join(' ');
}

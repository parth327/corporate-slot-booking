import { useEffect, useRef } from 'react';

/**
 * Calls `fn` every `intervalMs`, but never while the tab is hidden — a
 * backgrounded dashboard should not keep hammering the API.
 */
export default function usePolling(fn, intervalMs = 30000, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current?.();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs, enabled]);
}

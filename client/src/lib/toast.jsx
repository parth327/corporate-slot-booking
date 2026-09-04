/**
 * Toast notifications — a provider, a hook and the animated stack.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { slideUp } from './motion.js';
import cn from './cn.js';

const ToastContext = createContext(null);

const MAX_VISIBLE = 4;
const DURATION = { success: 4500, info: 4500, error: 7000 };

const TONE = {
  success: { Icon: CheckCircle2, bar: 'bg-success', icon: 'text-success' },
  error: { Icon: AlertCircle, bar: 'bg-danger', icon: 'text-danger' },
  info: { Icon: Info, bar: 'bg-info', icon: 'text-info' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // A counter, not Math.random — ids must be stable and collision-free.
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone, message) => {
      if (!message) return null;
      const id = nextId.current;
      nextId.current += 1;
      setToasts((list) => [...list, { id, tone, message: String(message) }].slice(-MAX_VISIBLE));
      const timer = setTimeout(() => dismiss(id), DURATION[tone] ?? 4500);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:items-end"
            role="status"
            aria-live="polite"
          >
            <AnimatePresence initial={false}>
              {toasts.map((toast) => {
                const { Icon, bar, icon } = TONE[toast.tone] || TONE.info;
                return (
                  <motion.div
                    key={toast.id}
                    layout
                    variants={slideUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-ink-100 bg-white pr-2 shadow-pop"
                  >
                    <span className={cn('w-1 self-stretch shrink-0', bar)} aria-hidden="true" />
                    <Icon size={18} className={cn('mt-3 shrink-0', icon)} aria-hidden="true" />
                    <p className="flex-1 py-3 text-sm text-ink-700">{toast.message}</p>
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      aria-label="Dismiss notification"
                      className="mt-2.5 rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <X size={15} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

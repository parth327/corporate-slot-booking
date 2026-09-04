import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import cn from '../../lib/cn.js';
import { backdropVariants, drawerVariants, slideUp, reduceMotion } from '../../lib/motion.js';

export default function Drawer({ open, onClose, title, description, side = 'right', className, children }) {
  const panelRef = useRef(null);
  const titleId = useId();

  const close = useCallback(() => {
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panelRef.current?.focus?.());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
      cancelAnimationFrame(raf);
    };
  }, [open, close]);

  if (typeof document === 'undefined') return null;

  // A side sheet is unusable on a narrow screen, so below sm it becomes a bottom sheet.
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
  const variants = reduceMotion ? drawerVariants : isMobile ? slideUp : drawerVariants;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={close}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop outline-none',
              'sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-2xl',
              side === 'left' && 'sm:mr-auto sm:rounded-l-none sm:rounded-r-2xl',
              className
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-base font-semibold text-ink-900">
                    {title}
                  </h2>
                )}
                {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

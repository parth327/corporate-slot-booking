import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import cn from '../../lib/cn.js';
import { backdropVariants, modalVariants } from '../../lib/motion.js';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  className,
  children,
  closeOnBackdrop = true,
  ...rest
}) {
  const panelRef = useRef(null);
  const restoreTo = useRef(null);
  const titleId = useId();
  const descId = useId();

  const close = useCallback(() => {
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  // Esc to close, Tab trapped inside the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  // Lock the page behind the dialog, and give focus back where it came from.
  useEffect(() => {
    if (!open) return undefined;
    restoreTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const raf = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector(FOCUSABLE) || panelRef.current;
      target?.focus?.();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = previousOverflow;
      if (restoreTo.current instanceof HTMLElement) restoreTo.current.focus();
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={closeOnBackdrop ? close : undefined}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop outline-none sm:rounded-2xl',
              SIZES[size] || SIZES.md,
              className
            )}
            {...rest}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
                <div className="min-w-0">
                  {title && (
                    <h2 id={titleId} className="text-base font-semibold text-ink-900">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id={descId} className="mt-1 text-sm text-ink-500">
                      {description}
                    </p>
                  )}
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
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

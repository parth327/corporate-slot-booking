import { ChevronLeft, ChevronRight } from 'lucide-react';
import cn from '../../lib/cn.js';

/** Up to 7 numbered buttons, with ellipses standing in for the rest. */
function pageWindow(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', totalPages];
  if (page >= totalPages - 3) {
    return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '…', page - 1, page, page + 1, '…', totalPages];
}

export default function Pagination({ page = 1, pageSize = 20, total = 0, onChange, className }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const go = (n) => onChange?.(Math.min(totalPages, Math.max(1, n)));

  const btn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 pt-4', className)}
    >
      <p className="text-xs text-ink-500">
        Showing <span className="font-medium text-ink-700">{from}</span>–
        <span className="font-medium text-ink-700">{to}</span> of{' '}
        <span className="font-medium text-ink-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, 'text-ink-600 hover:bg-ink-100')}
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pageWindow(page, totalPages).map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-ink-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => go(n)}
              aria-current={n === page ? 'page' : undefined}
              className={cn(
                btn,
                n === page ? 'bg-brand-600 font-medium text-white' : 'text-ink-600 hover:bg-ink-100'
              )}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button"
          className={cn(btn, 'text-ink-600 hover:bg-ink-100')}
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}

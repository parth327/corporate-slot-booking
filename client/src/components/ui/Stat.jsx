import cn from '../../lib/cn.js';
import Skeleton from './Skeleton.jsx';

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-success',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-red-50 text-danger',
  info: 'bg-sky-50 text-info',
  neutral: 'bg-ink-100 text-ink-500',
};

export default function Stat({ label, value, icon: Icon, tone = 'brand', hint, loading = false, className, ...rest }) {
  return (
    <div
      className={cn('rounded-2xl border border-ink-100 bg-white p-4 shadow-card sm:p-5', className)}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-14" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value ?? '—'}</p>
          )}
          {hint && !loading && <p className="mt-1 truncate text-xs text-ink-400">{hint}</p>}
        </div>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONES[tone] || TONES.brand)}>
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}

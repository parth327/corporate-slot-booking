import cn from '../../lib/cn.js';

const TONES = {
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

const DOTS = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  violet: 'bg-violet-500',
};

const SIZES = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' };

export default function Badge({ tone = 'neutral', size = 'sm', dot = false, className, children, ...rest }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone] || TONES.neutral,
        SIZES[size] || SIZES.sm,
        className
      )}
      {...rest}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone] || DOTS.neutral)} aria-hidden="true" />}
      {children}
    </span>
  );
}

import cn from '../../lib/cn.js';

/** `accent` adds a thin brand-gradient rule across the card's top edge — reserved for the one card that defines a page (a hero form, a primary panel), not every card on a page at once. */
export default function Card({ className, accent = false, children, ...rest }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-ink-100 bg-white shadow-card',
        accent && 'relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-brand-400 before:via-brand-500 before:to-brand-700 before:content-[\'\']',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, as: As = 'h2', ...rest }) {
  return (
    <As className={cn('text-base font-semibold text-ink-900', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardDescription({ className, children, ...rest }) {
  return (
    <p className={cn('text-sm text-ink-500', className)} {...rest}>
      {children}
    </p>
  );
}

export function CardBody({ className, children, ...rest }) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }) {
  return (
    <div
      className={cn('rounded-b-2xl border-t border-ink-100 bg-ink-50/60 px-5 py-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

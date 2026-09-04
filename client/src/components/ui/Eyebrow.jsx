import cn from '../../lib/cn.js';

/**
 * A small tracked-out uppercase label sitting above a heading — the
 * "eyebrow" convention that lets a page mix a bold, oversized display
 * headline with a quiet supporting line, rather than every heading being
 * the same weight. Decorative; never the only carrier of information.
 */
export default function Eyebrow({ tone = 'brand', className, children, ...rest }) {
  const TONE = {
    brand: 'text-brand-600',
    muted: 'text-ink-400',
    inverted: 'text-white/70',
  };
  return (
    <span
      className={cn(
        'block text-xs font-semibold uppercase tracking-[0.16em]',
        TONE[tone] || TONE.brand,
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

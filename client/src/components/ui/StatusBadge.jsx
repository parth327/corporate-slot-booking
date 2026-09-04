import cn from '../../lib/cn.js';
import { statusMeta } from '../../lib/status.js';

const SIZES = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-xs' };

export default function StatusBadge({ status, size = 'sm', className, ...rest }) {
  const { label, className: tone, Icon } = statusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap motion-safe:animate-badge-in',
        tone,
        SIZES[size] || SIZES.sm,
        className
      )}
      {...rest}
    >
      <Icon size={size === 'md' ? 14 : 12} className="shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

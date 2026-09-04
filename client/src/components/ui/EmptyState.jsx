import cn from '../../lib/cn.js';
import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, description, action, className, ...rest }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)} {...rest}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <Icon size={24} aria-hidden="true" />
      </span>
      {title && <h3 className="text-base font-semibold text-ink-900">{title}</h3>}
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

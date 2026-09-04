import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import cn from '../../lib/cn.js';

export default function PageHeader({ title, description, actions, breadcrumb, className }) {
  return (
    <header className={cn('mb-5', className)}>
      {breadcrumb && (
        <Link
          to={breadcrumb.to}
          className="mb-2 inline-flex items-center gap-1 rounded-lg text-sm text-ink-500 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          {breadcrumb.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 bg-clip-text text-xl font-bold tracking-tight text-transparent sm:text-2xl">
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

import cn from '../../lib/cn.js';

export default function Skeleton({ className, rounded = 'rounded-lg', ...rest }) {
  return <div className={cn('animate-pulse bg-ink-100', rounded, className)} {...rest} />;
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('rounded-2xl border border-ink-100 bg-white p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-5 w-20" rounded="rounded-full" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

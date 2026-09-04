import cn from '../../lib/cn.js';
import Skeleton from '../ui/Skeleton.jsx';
import Card from '../ui/Card.jsx';

/**
 * One table definition, two renderings: a real table from md up, stacked cards
 * below it. A horizontally scrolling table is unusable on a phone.
 *
 * columns: [{ key, header, render?(row), className?, hideBelow?, align? }]
 */
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
const ALIGN = { right: 'text-right', center: 'text-center' };

export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  empty = null,
  rowKey = (row) => row.id,
  onRowClick,
  skeletonRows = 6,
  className,
}) {
  const clickable = typeof onRowClick === 'function';

  if (loading) {
    return (
      <>
        <div className={cn('hidden overflow-hidden rounded-2xl border border-ink-100 bg-white md:block', className)}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left text-xs font-medium text-ink-500">
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i} className="border-b border-ink-100 last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 md:hidden">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="rounded-2xl" />
          ))}
        </div>
      </>
    );
  }

  if (rows.length === 0) return empty;

  return (
    <>
      {/* Desktop --------------------------------------------------------- */}
      <div className={cn('hidden overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card md:block', className)}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-ink-500',
                      col.hideBelow && HIDE[col.hideBelow],
                      ALIGN[col.align]
                    )}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  {...(clickable
                    ? {
                        onClick: () => onRowClick(row),
                        onKeyDown: (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        },
                        tabIndex: 0,
                        role: 'button',
                      }
                    : {})}
                  className={cn(
                    'border-b border-ink-100 text-sm text-ink-700 last:border-b-0',
                    clickable &&
                      'cursor-pointer transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:bg-ink-50'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3.5 align-middle',
                        col.hideBelow && HIDE[col.hideBelow],
                        ALIGN[col.align],
                        col.className
                      )}
                    >
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile ---------------------------------------------------------- */}
      <div className="space-y-2 md:hidden">
        {rows.map((row) => {
          const visible = columns.filter((col) => !col.hideBelow);
          const [lead, ...rest] = visible;
          const body = (
            <>
              {lead && <div className="mb-2 text-sm font-medium text-ink-900">{lead.render ? lead.render(row) : row[lead.key]}</div>}
              <dl className="space-y-1.5">
                {rest.map((col) => (
                  <div key={col.key} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-xs text-ink-400">{col.header}</dt>
                    <dd className="min-w-0 text-right text-xs text-ink-700">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return clickable ? (
            <Card
              key={rowKey(row)}
              as="div"
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              className="cursor-pointer p-4 transition-colors hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {body}
            </Card>
          ) : (
            <Card key={rowKey(row)} className="p-4">
              {body}
            </Card>
          );
        })}
      </div>
    </>
  );
}

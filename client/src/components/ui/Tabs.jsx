import { motion } from 'framer-motion';
import cn from '../../lib/cn.js';
import { reduceMotion } from '../../lib/motion.js';

export default function Tabs({ tabs = [], value, onChange, className, idPrefix = 'tab', ...rest }) {
  return (
    <div
      role="tablist"
      className={cn('scrollbar-thin flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1', className)}
      {...rest}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            id={`${idPrefix}-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange?.(tab.key)}
            className={cn(
              'relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              active ? 'text-ink-900' : 'text-ink-500 hover:text-ink-700'
            )}
          >
            {active && !reduceMotion && (
              <motion.span
                layoutId={`${idPrefix}-pill`}
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {active && reduceMotion && <span className="absolute inset-0 rounded-lg bg-white shadow-sm" />}
            <span className="relative flex items-center gap-1.5 whitespace-nowrap">
              {tab.label}
              {tab.count !== undefined && tab.count !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                    active ? 'bg-brand-50 text-brand-700' : 'bg-ink-200/70 text-ink-600'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

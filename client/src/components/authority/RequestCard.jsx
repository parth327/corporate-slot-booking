import { motion } from 'framer-motion';
import { CalendarDays, Clock, MapPin, Building2, ChevronRight } from 'lucide-react';
import cn from '../../lib/cn.js';
import { listItem } from '../../lib/motion.js';
import { formatDate, formatRange, minutesBetween, durationLabel, relativeTime, initials } from '../../lib/format.js';
import StatusBadge from '../ui/StatusBadge.jsx';

export default function RequestCard({ gatepass: g, onOpen, className }) {
  const open = () => onOpen?.(g);

  return (
    <motion.div
      variants={listItem}
      layout="position"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        'group cursor-pointer rounded-2xl border border-ink-100 bg-white p-4 text-left shadow-card transition-all sm:p-5',
        'hover:border-brand-200 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        className
      )}
      aria-label={`Review request from ${g.visitor_name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
            aria-hidden="true"
          >
            {initials(g.visitor_name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{g.visitor_name}</p>
            <p className="truncate text-xs text-ink-500">
              {[g.visitor_designation, g.visitor_company].filter(Boolean).join(' · ') || 'Visitor'}
            </p>
          </div>
        </div>
        <StatusBadge status={g.display_status} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-600">{g.reason}</p>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-ink-600">
          <CalendarDays size={14} className="shrink-0 text-ink-400" aria-hidden="true" />
          <dd className="truncate">{formatDate(g.requested_date)}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-ink-600">
          <Clock size={14} className="shrink-0 text-ink-400" aria-hidden="true" />
          <dd className="truncate">
            {formatRange(g.start_time, g.end_time)}
            <span className="ml-1 text-ink-400">
              ({durationLabel(minutesBetween(g.start_time, g.end_time))})
            </span>
          </dd>
        </div>
        {g.room_name ? (
          <div className="col-span-2 flex items-center gap-1.5 text-ink-600">
            <MapPin size={14} className="shrink-0 text-ink-400" aria-hidden="true" />
            <dd className="truncate">
              {[g.room_name, g.room_building, g.room_floor && `Floor ${g.room_floor}`]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        ) : (
          <div className="col-span-2 flex items-center gap-1.5 text-ink-400">
            <Building2 size={14} className="shrink-0" aria-hidden="true" />
            <dd>No room assigned yet</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
        <span className="text-xs text-ink-400">Submitted {relativeTime(g.created_at)}</span>
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 transition-transform group-hover:translate-x-0.5">
          Review
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </div>
    </motion.div>
  );
}

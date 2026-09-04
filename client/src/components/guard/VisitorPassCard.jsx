import {
  CheckCircle2, AlertTriangle, LogOut, MapPin, CalendarDays, Clock, UserRound, Building2,
} from 'lucide-react';
import cn from '../../lib/cn.js';
import { formatDate, formatRange, formatDateTime, initials } from '../../lib/format.js';

/**
 * The verification verdict a guard reads at the gate.
 *
 * A pass for another day or outside its window is a warning, not a rejection —
 * the guard decides. Only an unknown or unapproved pass never reaches here.
 */
export default function VisitorPassCard({ gatepass: g, checks, className }) {
  const warnings = [];
  if (checks) {
    if (!checks.is_today) warnings.push(`Scheduled for ${formatDate(g.requested_date)}, not today`);
    else if (!checks.within_window) warnings.push('Outside the scheduled time window');
    if (checks.already_checked_in && !checks.already_checked_out) {
      warnings.push(`Already checked in at ${formatDateTime(g.check_in_time)}`);
    }
  }

  const departed = Boolean(g.check_out_time);
  const tone = departed ? 'slate' : warnings.length ? 'amber' : 'emerald';

  const BANNER = {
    emerald: { bg: 'bg-success', Icon: CheckCircle2, title: 'Valid gatepass', sub: 'Cleared for entry' },
    amber: { bg: 'bg-warning', Icon: AlertTriangle, title: 'Check before admitting', sub: 'See the notes below' },
    slate: { bg: 'bg-ink-500', Icon: LogOut, title: 'Visit complete', sub: 'This visitor has checked out' },
  }[tone];

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card', className)}>
      <div className={cn('flex items-center gap-3 px-5 py-4 text-white', BANNER.bg)}>
        <BANNER.Icon size={26} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-base font-semibold leading-tight">{BANNER.title}</p>
          <p className="text-sm text-white/85">{BANNER.sub}</p>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1.5 border-b border-amber-100 bg-amber-50 px-5 py-3">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="px-5 py-5">
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-base font-semibold text-brand-700"
            aria-hidden="true"
          >
            {initials(g.visitor_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold leading-tight text-ink-900">{g.visitor_name}</h2>
            <p className="mt-0.5 truncate text-sm text-ink-500">
              {[g.visitor_designation, g.visitor_company].filter(Boolean).join(' · ') || 'Visitor'}
            </p>
            <p className="mt-1 font-mono text-xs tracking-wider text-ink-400">{g.qr_short_code}</p>
          </div>
        </div>

        {/* Destination is the thing a guard actually needs — make it the loudest. */}
        <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-brand-700">
            <MapPin size={13} aria-hidden="true" />
            Destination
          </p>
          {g.room_name ? (
            <>
              <p className="mt-1 text-2xl font-bold leading-tight text-ink-900">{g.room_name}</p>
              <p className="mt-0.5 text-sm text-ink-600">
                {[g.room_building, g.room_floor && `Floor ${g.room_floor}`].filter(Boolean).join(' · ') ||
                  'Location not specified'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-500">No room assigned</p>
          )}
        </div>

        <dl className="mt-4 space-y-3">
          <div className="flex items-start gap-3">
            <UserRound size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-xs text-ink-400">Meeting host</dt>
              <dd className="text-sm font-medium text-ink-800">
                {g.authority_name}
                {g.authority_department && (
                  <span className="font-normal text-ink-500"> · {g.authority_department}</span>
                )}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CalendarDays size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <div>
              <dt className="text-xs text-ink-400">Date</dt>
              <dd className="text-sm text-ink-800">{formatDate(g.requested_date)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Clock size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <div>
              <dt className="text-xs text-ink-400">Scheduled</dt>
              <dd className="text-sm text-ink-800">{formatRange(g.start_time, g.end_time)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Building2 size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <div>
              <dt className="text-xs text-ink-400">Purpose</dt>
              <dd className="text-sm text-ink-800">{g.reason}</dd>
            </div>
          </div>
        </dl>
      </div>
    </div>
  );
}

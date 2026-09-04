/**
 * The single source of truth for how a status looks anywhere in the UI.
 */
import { Clock, CheckCircle2, LogIn, CheckCheck, XCircle, CalendarClock, Ban, HelpCircle } from 'lucide-react';

const META = {
  PENDING: {
    label: 'Pending',
    tone: 'warning',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
    dotClassName: 'bg-amber-500',
    Icon: Clock,
  },
  APPROVED: {
    label: 'Approved',
    tone: 'brand',
    className: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
    dotClassName: 'bg-brand-500',
    Icon: CheckCircle2,
  },
  CHECKED_IN: {
    label: 'Checked in',
    tone: 'success',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    dotClassName: 'bg-emerald-500',
    Icon: LogIn,
  },
  COMPLETED: {
    label: 'Completed',
    tone: 'neutral',
    className: 'bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200',
    dotClassName: 'bg-ink-400',
    Icon: CheckCheck,
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    className: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
    dotClassName: 'bg-red-500',
    Icon: XCircle,
  },
  RESCHEDULE_REQUESTED: {
    label: 'Reschedule requested',
    tone: 'violet',
    className: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
    dotClassName: 'bg-violet-500',
    Icon: CalendarClock,
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'neutral',
    className: 'bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200',
    dotClassName: 'bg-ink-300',
    Icon: Ban,
  },
};

const UNKNOWN = {
  label: 'Unknown',
  tone: 'neutral',
  className: 'bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200',
  dotClassName: 'bg-ink-300',
  Icon: HelpCircle,
};

/** Never throws on an unexpected value — an unknown status renders neutrally. */
export function statusMeta(status) {
  return META[status] || UNKNOWN;
}

/** Order used when a view groups or sorts by status. */
export const STATUS_ORDER = [
  'PENDING',
  'RESCHEDULE_REQUESTED',
  'APPROVED',
  'CHECKED_IN',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

/** Values the API actually accepts as a `status` filter (display-only states excluded). */
export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'RESCHEDULE_REQUESTED', label: 'Reschedule requested' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

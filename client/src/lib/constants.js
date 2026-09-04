/**
 * Role definitions, navigation and shared option lists.
 */
import {
  LayoutDashboard,
  ClipboardList,
  CalendarRange,
  Users,
  DoorOpen,
  ScrollText,
  ScanLine,
  Search,
} from 'lucide-react';

export const ROLES = { ADMIN: 'ADMIN', AUTHORITY: 'AUTHORITY', GUARD: 'GUARD' };

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  AUTHORITY: 'Approval authority',
  GUARD: 'Security guard',
};

export const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'AUTHORITY', label: 'Approval authority' },
  { value: 'GUARD', label: 'Security guard' },
];

const NAV = {
  ADMIN: [
    { to: '/admin', label: 'Overview', Icon: LayoutDashboard, end: true },
    { to: '/admin/gatepasses', label: 'Gatepasses', Icon: ClipboardList },
    { to: '/admin/users', label: 'Users', Icon: Users },
    { to: '/admin/rooms', label: 'Rooms', Icon: DoorOpen },
    { to: '/admin/logs', label: 'Logs', Icon: ScrollText },
  ],
  AUTHORITY: [
    { to: '/authority', label: 'Requests', Icon: ClipboardList, end: true },
    { to: '/authority/rooms', label: 'Room board', Icon: CalendarRange },
  ],
  GUARD: [
    { to: '/guard', label: 'Scan', Icon: ScanLine, end: true },
    { to: '/guard/search', label: 'Search', Icon: Search },
  ],
};

export function navFor(role) {
  return NAV[role] || [];
}

/** '00:00' … '23:45' at quarter-hour steps, for time selects. */
export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

export const PAGE_SIZE = 20;

/** Window the room board renders, in hours. */
export const BOARD_START_HOUR = 7;
export const BOARD_END_HOUR = 21;

/** Actions the server writes to activity_logs, for the admin filter. */
export const ACTIVITY_ACTIONS = [
  'GATEPASS_REQUESTED',
  'GATEPASS_APPROVED',
  'GATEPASS_REJECTED',
  'GATEPASS_RESCHEDULE_REQUESTED',
  'GATEPASS_RESCHEDULED_BY_VISITOR',
  'GATEPASS_COMMENTED',
  'GATEPASS_ROOM_SWITCHED',
  'GATEPASS_CLOSED_EARLY',
  'GATEPASS_EMAIL_RESENT',
  'GATEPASS_SCANNED',
  'VISITOR_CHECKED_IN',
  'VISITOR_CHECKED_OUT',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'ROOM_CREATED',
  'ROOM_UPDATED',
  'ROOM_DEACTIVATED',
  'ROOM_DELETED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
];

/** 'GATEPASS_CLOSED_EARLY' -> 'Gatepass closed early' */
export function humaniseAction(action) {
  if (!action) return '';
  const words = String(action).toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ` ${words.slice(1).join(' ')}` : '');
}

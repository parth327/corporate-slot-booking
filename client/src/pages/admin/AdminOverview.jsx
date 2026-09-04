import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, DoorOpen, ClipboardList, LogIn, CheckCheck, CalendarClock, AlertCircle } from 'lucide-react';
import cn from '../../lib/cn.js';
import { adminApi } from '../../lib/api.js';
import { pageVariants } from '../../lib/motion.js';
import { statusMeta, STATUS_ORDER } from '../../lib/status.js';
import { formatDate, formatRange, durationLabel } from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader, CardTitle } from '../../components/ui/Card.jsx';
import Stat from '../../components/ui/Stat.jsx';
import Button from '../../components/ui/Button.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

const BAR_TONE = {
  PENDING: 'bg-amber-400',
  APPROVED: 'bg-brand-500',
  RESCHEDULE_REQUESTED: 'bg-violet-400',
  REJECTED: 'bg-red-400',
  CANCELLED: 'bg-ink-300',
  CHECKED_IN: 'bg-emerald-500',
  COMPLETED: 'bg-ink-400',
};

export default function AdminOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Overview · GatePass';
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await adminApi.overview());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statuses = Object.entries(data?.counts?.gatepasses_by_status || {}).sort(
    (a, b) => STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0])
  );
  const statusTotal = statuses.reduce((sum, [, n]) => sum + n, 0);
  const busiest = Math.max(1, ...(data?.room_utilisation || []).map((r) => r.minutes_booked || 0));

  if (error && !data) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <PageHeader title="Overview" />
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="Could not load the dashboard"
            description={error}
            action={<Button onClick={load}>Try again</Button>}
          />
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader title="Overview" description="Everything happening across the building today." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Active users"
          value={
            data
              ? (data.counts.users_by_role.ADMIN || 0) +
                (data.counts.users_by_role.AUTHORITY || 0) +
                (data.counts.users_by_role.GUARD || 0)
              : undefined
          }
          hint={
            data
              ? `${data.counts.users_by_role.AUTHORITY || 0} hosts · ${data.counts.users_by_role.GUARD || 0} guards`
              : undefined
          }
          icon={Users}
          tone="brand"
          loading={!data}
        />
        <Stat label="Meeting rooms" value={data?.counts.rooms} icon={DoorOpen} tone="info" loading={!data} />
        <Stat label="Expected today" value={data?.today.expected} icon={ClipboardList} tone="warning" loading={!data} />
        <Stat label="On premises" value={data?.today.checked_in} icon={LogIn} tone="success" loading={!data} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gatepasses by status</CardTitle>
          </CardHeader>
          <CardBody>
            {!data ? (
              <div className="h-24 animate-pulse rounded-xl bg-ink-100" />
            ) : statusTotal === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">No gatepasses yet.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-ink-100" role="img" aria-label="Gatepass status breakdown">
                  {statuses.map(([status, count]) => (
                    <span
                      key={status}
                      className={cn('transition-[width] duration-700 ease-out', BAR_TONE[status] || 'bg-ink-300')}
                      style={{ width: `${(count / statusTotal) * 100}%` }}
                      title={`${statusMeta(status).label}: ${count}`}
                    />
                  ))}
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                  {statuses.map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', BAR_TONE[status] || 'bg-ink-300')} aria-hidden="true" />
                        <span className="truncate text-ink-600">{statusMeta(status).label}</span>
                      </span>
                      <span className="font-medium tabular-nums text-ink-900">{count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Room utilisation today</CardTitle>
          </CardHeader>
          <CardBody>
            {!data ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-ink-100" />
                ))}
              </div>
            ) : data.room_utilisation.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">No active rooms.</p>
            ) : (
              <ul className="space-y-3">
                {data.room_utilisation.map((room) => (
                  <li key={room.room_id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-ink-700">{room.room_name}</span>
                      <span className="shrink-0 text-xs text-ink-400">
                        {room.bookings_today} booking{room.bookings_today === 1 ? '' : 's'} ·{' '}
                        {durationLabel(room.minutes_booked)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-500 transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.round(((room.minutes_booked || 0) / busiest) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Upcoming meetings</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/gatepasses')}>
            View all
          </Button>
        </CardHeader>
        <CardBody className="p-0 md:p-5">
          <DataTable
            loading={!data}
            rows={data?.upcoming || []}
            onRowClick={() => navigate('/admin/gatepasses')}
            columns={[
              { key: 'visitor_name', header: 'Visitor', render: (r) => (
                <span>
                  <span className="block font-medium text-ink-900">{r.visitor_name}</span>
                  <span className="block text-xs text-ink-400">{r.visitor_company || '—'}</span>
                </span>
              ) },
              { key: 'authority_name', header: 'Host', hideBelow: 'md' },
              { key: 'room_name', header: 'Room', render: (r) => r.room_name || '—' },
              { key: 'requested_date', header: 'Date', render: (r) => formatDate(r.requested_date) },
              { key: 'time', header: 'Time', render: (r) => formatRange(r.start_time, r.end_time), hideBelow: 'lg' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.display_status} /> },
            ]}
            empty={
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled"
                description="Approved meetings from today onward will appear here."
                className="py-10"
              />
            }
          />
        </CardBody>
      </Card>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Completed today" value={data?.today.completed} icon={CheckCheck} tone="neutral" loading={!data} />
        <Stat
          label="Total gatepasses"
          value={data ? statusTotal : undefined}
          icon={ClipboardList}
          tone="info"
          loading={!data}
        />
      </div>
    </motion.div>
  );
}

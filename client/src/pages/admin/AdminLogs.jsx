import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ScrollText, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { adminApi } from '../../lib/api.js';
import { pageVariants } from '../../lib/motion.js';
import { PAGE_SIZE, ACTIVITY_ACTIONS, humaniseAction } from '../../lib/constants.js';
import { formatDate, formatRange, formatDateTime, relativeTime, durationLabel } from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Select from '../../components/ui/Select.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DataTable from '../../components/admin/DataTable.jsx';

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'meetings', label: 'Meeting logs' },
];

const ACTION_TONE = (action) => {
  if (/REJECT|FAILED|DEACTIVATED|DELETED/.test(action)) return 'danger';
  if (/APPROVED|CHECKED_IN|CREATED/.test(action)) return 'success';
  if (/RESCHEDULE|SWITCHED|CLOSED_EARLY/.test(action)) return 'warning';
  if (/SCANNED|LOGIN_SUCCESS/.test(action)) return 'info';
  return 'neutral';
};

const MEETING_TONE = {
  SCHEDULED: 'brand',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  EARLY_CLOSED: 'warning',
};

function ActivityTab() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setData(null);
    setError('');
    try {
      setData(await adminApi.activity({ page, pageSize: PAGE_SIZE, ...(action ? { action } : {}) }));
    } catch (err) {
      setError(err.message);
      setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }
  }, [page, action]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [action]);

  return (
    <>
      <div className="mb-4 max-w-xs">
        <Select
          aria-label="Filter by action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={[
            { value: '', label: 'All actions' },
            ...ACTIVITY_ACTIONS.map((a) => ({ value: a, label: humaniseAction(a) })),
          ]}
        />
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </span>
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      <DataTable
        loading={data === null}
        rows={data?.items || []}
        columns={[
          {
            key: 'created_at',
            header: 'When',
            render: (r) => (
              <span title={formatDateTime(r.created_at)} className="whitespace-nowrap text-ink-500">
                {relativeTime(r.created_at)}
              </span>
            ),
          },
          {
            key: 'actor',
            header: 'Actor',
            render: (r) => r.actor_name || r.actor_label || 'System',
          },
          {
            key: 'action',
            header: 'Action',
            render: (r) => <Badge tone={ACTION_TONE(r.action)}>{humaniseAction(r.action)}</Badge>,
          },
          {
            key: 'entity',
            header: 'Entity',
            hideBelow: 'md',
            render: (r) => (r.entity_type ? `${r.entity_type} #${r.entity_id}` : '—'),
          },
          { key: 'ip', header: 'IP', hideBelow: 'lg', render: (r) => r.ip || '—' },
          {
            key: 'meta',
            header: '',
            align: 'right',
            render: (r) =>
              r.meta ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2"
                  aria-label={expanded === r.id ? 'Hide details' : 'Show details'}
                  aria-expanded={expanded === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((cur) => (cur === r.id ? null : r.id));
                  }}
                >
                  {expanded === r.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </Button>
              ) : null,
          },
        ]}
        empty={
          <Card>
            <EmptyState
              icon={ScrollText}
              title="No activity recorded"
              description="Approvals, check-ins, sign-ins and admin changes all appear here."
            />
          </Card>
        }
      />

      {expanded && data?.items.find((i) => i.id === expanded)?.meta && (
        <Card className="mt-3">
          <pre className="scrollbar-thin overflow-x-auto p-4 text-xs text-ink-600">
            {JSON.stringify(data.items.find((i) => i.id === expanded).meta, null, 2)}
          </pre>
        </Card>
      )}

      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </>
  );
}

function MeetingsTab() {
  const [page, setPage] = useState(1);
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setData(null);
    setError('');
    try {
      setData(
        await adminApi.meetingLogs({
          page,
          pageSize: PAGE_SIZE,
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
        })
      );
    } catch (err) {
      setError(err.message);
      setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }
  }, [page, range]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  return (
    <>
      <div className="mb-4 grid max-w-md gap-3 sm:grid-cols-2">
        <DatePicker
          aria-label="From date"
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
        />
        <DatePicker
          aria-label="To date"
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
        />
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </span>
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      <DataTable
        loading={data === null}
        rows={data?.items || []}
        columns={[
          { key: 'gatepass_id', header: '#', hideBelow: 'lg', render: (r) => <span className="tabular-nums text-ink-400">{r.gatepass_id}</span> },
          { key: 'visitor_name', header: 'Visitor', render: (r) => <span className="font-medium text-ink-900">{r.visitor_name}</span> },
          { key: 'authority_name', header: 'Host', hideBelow: 'md' },
          { key: 'room_name', header: 'Room', hideBelow: 'md', render: (r) => r.room_name || '—' },
          {
            key: 'scheduled',
            header: 'Scheduled',
            render: (r) => (
              <span className="whitespace-nowrap">
                {formatDate(r.requested_date)}
                <span className="ml-1.5 text-xs text-ink-400">{formatRange(r.start_time, r.end_time)}</span>
              </span>
            ),
          },
          {
            key: 'actual_start',
            header: 'Actual start',
            hideBelow: 'lg',
            render: (r) => (r.actual_start ? formatDateTime(r.actual_start) : '—'),
          },
          {
            key: 'actual_end',
            header: 'Actual end',
            hideBelow: 'lg',
            render: (r) => (r.actual_end ? formatDateTime(r.actual_end) : '—'),
          },
          {
            key: 'duration_minutes',
            header: 'Duration',
            render: (r) => (r.duration_minutes != null ? durationLabel(r.duration_minutes) : '—'),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge tone={MEETING_TONE[r.status] || 'neutral'}>{humaniseAction(r.status)}</Badge>,
          },
        ]}
        empty={
          <Card>
            <EmptyState
              icon={ScrollText}
              title="No meeting logs yet"
              description="A log is created when a request is approved, and updated as the visitor arrives and leaves."
            />
          </Card>
        }
      />

      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
    </>
  );
}

export default function AdminLogs() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'meetings' ? 'meetings' : 'activity';

  useEffect(() => {
    document.title = 'Logs · GatePass';
  }, []);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader title="Logs" description="An audit trail of every action, and a record of every meeting." />

      <div className="mb-5 max-w-xs">
        <Tabs
          tabs={TABS}
          value={tab}
          idPrefix="logs"
          onChange={(key) => setParams(key === 'activity' ? {} : { tab: key }, { replace: true })}
        />
      </div>

      {tab === 'activity' ? <ActivityTab /> : <MeetingsTab />}
    </motion.div>
  );
}

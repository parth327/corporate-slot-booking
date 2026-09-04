import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, X, ClipboardList, AlertCircle } from 'lucide-react';
import { adminApi, roomApi } from '../../lib/api.js';
import { pageVariants } from '../../lib/motion.js';
import { PAGE_SIZE } from '../../lib/constants.js';
import { STATUS_OPTIONS } from '../../lib/status.js';
import { formatDate, formatRange, formatDateTime, durationLabel, minutesBetween } from '../../lib/format.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DataTable from '../../components/admin/DataTable.jsx';

function Detail({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-2.5 last:border-b-0">
      <dt className="shrink-0 text-xs text-ink-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink-800">{children ?? '—'}</dd>
    </div>
  );
}

export default function AdminGatepasses() {
  const [params, setParams] = useSearchParams();

  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const roomId = params.get('room_id') || '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(params.get('q') || '');
  const debounced = useDebouncedValue(search, 350);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    document.title = 'All gatepasses · GatePass';
    roomApi.list({ active: false }).then(setRooms).catch(() => setRooms([]));
  }, []);

  const patch = useCallback(
    (updates) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (!value) next.delete(key);
            else next.set(key, String(value));
          }
          if (!('page' in updates)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    const current = params.get('q') || '';
    if (debounced !== current) patch({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const load = useCallback(async () => {
    setData(null);
    setError('');
    try {
      setData(
        await adminApi.gatepasses({
          ...(status ? { status } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(roomId ? { room_id: roomId } : {}),
          ...(debounced ? { q: debounced } : {}),
          page,
          pageSize: PAGE_SIZE,
        })
      );
    } catch (err) {
      setError(err.message);
      setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }
  }, [status, from, to, roomId, debounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = Boolean(status || from || to || roomId || debounced);
  const reset = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader title="All gatepasses" description="Every visitor request across all hosts." />

      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem_auto]">
        <Input
          icon={Search}
          type="search"
          placeholder="Visitor, company, email or number"
          aria-label="Search gatepasses"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label="Filter by status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => patch({ status: e.target.value })}
        />
        <DatePicker aria-label="From date" value={from} onChange={(e) => patch({ from: e.target.value })} />
        <DatePicker aria-label="To date" value={to} onChange={(e) => patch({ to: e.target.value })} />
        <Select
          aria-label="Filter by room"
          value={roomId}
          onChange={(e) => patch({ room_id: e.target.value })}
          options={[{ value: '', label: 'All rooms' }, ...rooms.map((r) => ({ value: String(r.id), label: r.name }))]}
        />
      </div>

      {hasFilters && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" icon={X} onClick={reset}>
            Reset filters
          </Button>
        </div>
      )}

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
        onRowClick={setSelected}
        columns={[
          { key: 'id', header: '#', hideBelow: 'lg', render: (g) => <span className="tabular-nums text-ink-400">{g.id}</span> },
          {
            key: 'visitor_name',
            header: 'Visitor',
            render: (g) => (
              <span>
                <span className="block font-medium text-ink-900">{g.visitor_name}</span>
                <span className="block text-xs text-ink-400">{g.visitor_company || '—'}</span>
              </span>
            ),
          },
          { key: 'authority_name', header: 'Host', hideBelow: 'md' },
          {
            key: 'room_name',
            header: 'Room',
            hideBelow: 'md',
            render: (g) =>
              g.room_name ? `${g.room_name}${g.room_floor ? ` · Fl ${g.room_floor}` : ''}` : '—',
          },
          { key: 'requested_date', header: 'Date', render: (g) => formatDate(g.requested_date) },
          { key: 'time', header: 'Time', hideBelow: 'lg', render: (g) => formatRange(g.start_time, g.end_time) },
          { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.display_status} /> },
          {
            key: 'check_in_time',
            header: 'In / Out',
            hideBelow: 'lg',
            render: (g) => (
              <span className="text-xs text-ink-500">
                {g.check_in_time ? formatDateTime(g.check_in_time).split(', ')[1] : '—'}
                {' / '}
                {g.check_out_time ? formatDateTime(g.check_out_time).split(', ')[1] : '—'}
              </span>
            ),
          },
        ]}
        empty={
          <Card>
            <EmptyState
              icon={ClipboardList}
              title={hasFilters ? 'No gatepasses match these filters' : 'No gatepasses yet'}
              description={
                hasFilters
                  ? 'Try widening the date range or clearing the search.'
                  : 'Requests appear here as soon as visitors start submitting the form.'
              }
              action={hasFilters ? <Button variant="secondary" onClick={reset}>Reset filters</Button> : null}
            />
          </Card>
        }
      />

      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(n) => patch({ page: n })} />}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.visitor_name}
        description={selected ? `Gatepass #${selected.id}` : undefined}
      >
        {selected && (
          <div className="space-y-6">
            <div>
              <StatusBadge status={selected.display_status} size="md" />
            </div>

            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Visitor</h3>
              <dl>
                <Detail label="Name">{selected.visitor_name}</Detail>
                <Detail label="Company">{selected.visitor_company}</Detail>
                <Detail label="Designation">{selected.visitor_designation}</Detail>
                <Detail label="Email">{selected.visitor_email}</Detail>
                <Detail label="Mobile">{selected.visitor_mobile}</Detail>
                <Detail label="WhatsApp">{selected.visitor_whatsapp}</Detail>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Meeting</h3>
              <dl>
                <Detail label="Host">{selected.authority_name}</Detail>
                <Detail label="Department">{selected.authority_department}</Detail>
                <Detail label="Host email">{selected.authority_email}</Detail>
                <Detail label="Purpose">{selected.reason}</Detail>
                <Detail label="Date">{formatDate(selected.requested_date)}</Detail>
                <Detail label="Time">
                  {formatRange(selected.start_time, selected.end_time)}{' '}
                  <span className="text-ink-400">
                    ({durationLabel(minutesBetween(selected.start_time, selected.end_time))})
                  </span>
                </Detail>
                <Detail label="Room">
                  {selected.room_name
                    ? [selected.room_name, selected.room_building, selected.room_floor && `Floor ${selected.room_floor}`]
                        .filter(Boolean)
                        .join(' · ')
                    : null}
                </Detail>
                <Detail label="Gatepass code">
                  {selected.qr_short_code ? (
                    <code className="font-mono tracking-wider">{selected.qr_short_code}</code>
                  ) : null}
                </Detail>
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">Timeline</h3>
              <dl>
                <Detail label="Submitted">{formatDateTime(selected.created_at)}</Detail>
                <Detail label="Approved">{selected.approved_at ? formatDateTime(selected.approved_at) : null}</Detail>
                <Detail label="Checked in">{selected.check_in_time ? formatDateTime(selected.check_in_time) : null}</Detail>
                <Detail label="Checked out">{selected.check_out_time ? formatDateTime(selected.check_out_time) : null}</Detail>
                <Detail label="Meeting status">{selected.meeting_status}</Detail>
                <Detail label="Closed early">{selected.is_closed_early ? 'Yes' : 'No'}</Detail>
              </dl>
            </section>

            {selected.authority_comment && (
              <section>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">Host notes</h3>
                <p className="whitespace-pre-line rounded-xl bg-ink-50 px-3.5 py-3 text-sm text-ink-700">
                  {selected.authority_comment}
                </p>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </motion.div>
  );
}

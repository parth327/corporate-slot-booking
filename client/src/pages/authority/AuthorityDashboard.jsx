import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Inbox, AlertCircle, Clock, CheckCircle2, LogIn, CheckCheck, X } from 'lucide-react';
import { gatepassApi, roomApi } from '../../lib/api.js';
import { pageVariants, listContainer } from '../../lib/motion.js';
import { PAGE_SIZE } from '../../lib/constants.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import usePolling from '../../hooks/usePolling.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import RequestCard from '../../components/authority/RequestCard.jsx';
import Stat from '../../components/ui/Stat.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import Button from '../../components/ui/Button.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import { SkeletonCard } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Card from '../../components/ui/Card.jsx';

const TABS = [
  { key: 'all', label: 'All', status: '' },
  { key: 'pending', label: 'Pending', status: 'PENDING' },
  { key: 'approved', label: 'Approved', status: 'APPROVED' },
  { key: 'reschedule', label: 'Reschedule', status: 'RESCHEDULE_REQUESTED' },
  { key: 'rejected', label: 'Rejected', status: 'REJECTED' },
];

export default function AuthorityDashboard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') || 'all';
  const page = Number(params.get('page')) || 1;
  const date = params.get('date') || '';
  const roomId = params.get('room_id') || '';
  const [search, setSearch] = useState(params.get('q') || '');
  const debouncedSearch = useDebouncedValue(search, 350);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [rooms, setRooms] = useState([]);

  const patch = useCallback(
    (updates) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === '' || value === null || value === undefined) next.delete(key);
            else next.set(key, String(value));
          }
          // Any filter change resets to the first page.
          if (!('page' in updates)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    document.title = 'Visitor requests · GatePass';
    roomApi.list().then(setRooms).catch(() => setRooms([]));
  }, []);

  // Keep the URL in step with the debounced search box.
  useEffect(() => {
    const current = params.get('q') || '';
    if (debouncedSearch !== current) patch({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setData(null);
      setError('');
      const status = TABS.find((t) => t.key === tab)?.status ?? '';
      try {
        const [list, summary] = await Promise.all([
          gatepassApi.list({
            ...(status ? { status } : {}),
            ...(date ? { date } : {}),
            ...(roomId ? { room_id: roomId } : {}),
            ...(debouncedSearch ? { q: debouncedSearch } : {}),
            page,
            pageSize: PAGE_SIZE,
          }),
          gatepassApi.stats(),
        ]);
        setData(list);
        setStats(summary);
      } catch (err) {
        setError(err.message);
        setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
      }
    },
    [tab, date, roomId, debouncedSearch, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => load({ quiet: true }), 30000, true);

  const hasFilters = Boolean(date || roomId || debouncedSearch || tab !== 'all');
  const clearFilters = () => {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader
        title="Visitor requests"
        description="Review requests, reserve a room and manage today's meetings."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={stats?.pending} icon={Clock} tone="warning" loading={!stats} />
        <Stat label="Approved today" value={stats?.approved_today} icon={CheckCircle2} tone="brand" loading={!stats} />
        <Stat label="On premises" value={stats?.checked_in} icon={LogIn} tone="success" loading={!stats} />
        <Stat label="Completed today" value={stats?.completed_today} icon={CheckCheck} tone="neutral" loading={!stats} />
      </div>

      <div className="mb-5 space-y-3">
        <Tabs
          tabs={TABS.map((t) => ({
            ...t,
            count:
              t.key === 'pending'
                ? stats?.pending
                : t.key === 'reschedule'
                  ? stats?.reschedule_requested
                  : undefined,
          }))}
          value={tab}
          onChange={(key) => patch({ tab: key === 'all' ? '' : key })}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
          <Input
            icon={Search}
            type="search"
            placeholder="Search visitor, company or number"
            aria-label="Search requests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DatePicker aria-label="Filter by date" value={date} onChange={(e) => patch({ date: e.target.value })} />
          <Select
            aria-label="Filter by room"
            placeholder="All rooms"
            value={roomId}
            onChange={(e) => patch({ room_id: e.target.value })}
            options={[
              { value: '', label: 'All rooms' },
              ...rooms.map((r) => ({ value: String(r.id), label: r.name })),
            ]}
          />
          {hasFilters && (
            <Button variant="ghost" icon={X} onClick={clearFilters} className="justify-self-start">
              Clear
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => load()}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {data === null ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={hasFilters ? 'No requests match these filters' : 'No visitor requests yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing the search.'
                : 'When someone submits the visitor form and names you as their host, their request appears here.'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <motion.div
            variants={listContainer}
            initial="initial"
            animate="animate"
            className="grid gap-4 xl:grid-cols-2"
          >
            {data.items.map((g) => (
              <RequestCard
                key={g.id}
                gatepass={g}
                onOpen={() => navigate(`/authority/requests/${g.id}`)}
              />
            ))}
          </motion.div>

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onChange={(next) => patch({ page: next })}
          />
        </>
      )}
    </motion.div>
  );
}

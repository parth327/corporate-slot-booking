import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Search, Pencil, UserX, Users, AlertCircle } from 'lucide-react';
import { adminApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants } from '../../lib/motion.js';
import { PAGE_SIZE, ROLE_LABELS } from '../../lib/constants.js';
import { formatDate, initials } from '../../lib/format.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import UserFormModal from '../../components/admin/UserFormModal.jsx';

const TABS = [
  { key: 'all', label: 'All', role: '' },
  { key: 'ADMIN', label: 'Admins', role: 'ADMIN' },
  { key: 'AUTHORITY', label: 'Hosts', role: 'AUTHORITY' },
  { key: 'GUARD', label: 'Guards', role: 'GUARD' },
];

const ROLE_TONE = { ADMIN: 'violet', AUTHORITY: 'brand', GUARD: 'info' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 350);

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [deactivating, setDeactivating] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Users · GatePass';
  }, []);

  const load = useCallback(async () => {
    setData(null);
    setError('');
    try {
      const role = TABS.find((t) => t.key === tab)?.role;
      setData(
        await adminApi.users({
          ...(role ? { role } : {}),
          ...(debounced ? { q: debounced } : {}),
          page,
          pageSize: PAGE_SIZE,
        })
      );
    } catch (err) {
      setError(err.message);
      setData({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE });
    }
  }, [tab, debounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, debounced]);

  const deactivate = async () => {
    setBusy(true);
    try {
      await adminApi.deleteUser(deactivating.id);
      toast.success(`${deactivating.name} deactivated.`);
      setDeactivating(null);
      load();
    } catch (err) {
      toast.error(err.message);
      setDeactivating(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader
        title="Users"
        description="Approval authorities, security guards and administrators."
        actions={
          <Button icon={UserPlus} onClick={() => setEditing(null)}>
            Add user
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:items-center">
        <Input
          icon={Search}
          type="search"
          placeholder="Search name, email or department"
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Tabs tabs={TABS} value={tab} onChange={setTab} idPrefix="user-role" className="sm:justify-self-end" />
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
            key: 'name',
            header: 'Name',
            render: (u) => (
              <span className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700"
                  aria-hidden="true"
                >
                  {initials(u.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink-900">{u.name}</span>
                  <span className="block truncate text-xs text-ink-400">{u.email}</span>
                </span>
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            render: (u) => <Badge tone={ROLE_TONE[u.role] || 'neutral'}>{ROLE_LABELS[u.role] || u.role}</Badge>,
          },
          { key: 'mobile', header: 'Mobile', hideBelow: 'lg', render: (u) => u.mobile || '—' },
          { key: 'department', header: 'Department', hideBelow: 'md', render: (u) => u.department || '—' },
          {
            key: 'is_active',
            header: 'Status',
            render: (u) => (
              <Badge tone={u.is_active ? 'success' : 'neutral'} dot>
                {u.is_active ? 'Active' : 'Inactive'}
              </Badge>
            ),
          },
          {
            key: 'created_at',
            header: 'Added',
            hideBelow: 'lg',
            render: (u) => formatDate(String(u.created_at).slice(0, 10)),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (u) => (
              <span className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${u.name}`}
                  onClick={() => setEditing(u)}
                  className="px-2"
                >
                  <Pencil size={15} />
                </Button>
                {u.is_active && u.id !== me?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Deactivate ${u.name}`}
                    onClick={() => setDeactivating(u)}
                    className="px-2 text-danger hover:bg-red-50"
                  >
                    <UserX size={15} />
                  </Button>
                )}
              </span>
            ),
          },
        ]}
        empty={
          <Card>
            <EmptyState
              icon={Users}
              title={debounced ? 'No users match that search' : 'No users yet'}
              description={
                debounced
                  ? 'Try a different name, email or department.'
                  : 'Add approval authorities and guards so they can sign in.'
              }
              action={
                <Button icon={UserPlus} onClick={() => setEditing(null)}>
                  Add user
                </Button>
              }
            />
          </Card>
        }
      />

      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
      )}

      <UserFormModal
        open={editing !== undefined}
        user={editing || null}
        onClose={() => setEditing(undefined)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={deactivate}
        title={`Deactivate ${deactivating?.name}?`}
        description="They will no longer be able to sign in. Their past gatepasses and logs are kept."
        confirmLabel="Deactivate"
        tone="danger"
        loading={busy}
      />
    </motion.div>
  );
}

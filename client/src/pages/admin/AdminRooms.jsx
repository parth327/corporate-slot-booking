import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, DoorOpen, CalendarRange, AlertCircle } from 'lucide-react';
import { roomApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants } from '../../lib/motion.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import DataTable from '../../components/admin/DataTable.jsx';
import RoomFormModal from '../../components/admin/RoomFormModal.jsx';

export default function AdminRooms() {
  const navigate = useNavigate();
  const toast = useToast();

  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Rooms · GatePass';
  }, []);

  const load = useCallback(async () => {
    setRooms(null);
    setError('');
    try {
      // active=false lifts the default filter so deactivated rooms stay visible.
      setRooms(await roomApi.list({ active: false }));
    } catch (err) {
      setError(err.message);
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    setBusy(true);
    try {
      const result = await roomApi.remove(deleting.id);
      toast.success(result.message || (result.soft ? 'Room deactivated.' : 'Room deleted.'));
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader
        title="Meeting rooms"
        description="Rooms offered to hosts when they approve a visitor request."
        actions={
          <Button icon={Plus} onClick={() => setEditing(null)}>
            Add room
          </Button>
        }
      />

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
        loading={rooms === null}
        rows={rooms || []}
        columns={[
          {
            key: 'name',
            header: 'Room',
            render: (r) => <span className="font-medium text-ink-900">{r.name}</span>,
          },
          { key: 'building', header: 'Building', render: (r) => r.building || '—' },
          { key: 'floor', header: 'Floor', render: (r) => r.floor || '—' },
          { key: 'capacity', header: 'Seats', render: (r) => r.capacity || '—' },
          {
            key: 'amenities',
            header: 'Amenities',
            hideBelow: 'lg',
            render: (r) => <span className="text-ink-500">{r.amenities || '—'}</span>,
          },
          {
            key: 'is_active',
            header: 'Status',
            render: (r) => (
              <Badge tone={r.is_active ? 'success' : 'neutral'} dot>
                {r.is_active ? 'Bookable' : 'Out of service'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <span className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`View the day schedule for ${r.name}`}
                  onClick={() => navigate('/authority/rooms')}
                  className="px-2"
                >
                  <CalendarRange size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${r.name}`}
                  onClick={() => setEditing(r)}
                  className="px-2"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => setDeleting(r)}
                  className="px-2 text-danger hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </Button>
              </span>
            ),
          },
        ]}
        empty={
          <Card>
            <EmptyState
              icon={DoorOpen}
              title="No meeting rooms yet"
              description="Add rooms so hosts have somewhere to put their visitors."
              action={
                <Button icon={Plus} onClick={() => setEditing(null)}>
                  Add room
                </Button>
              }
            />
          </Card>
        }
      />

      <RoomFormModal
        open={editing !== undefined}
        room={editing || null}
        onClose={() => setEditing(undefined)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.name}?`}
        description="A room that has been booked before is taken out of service rather than deleted, so its history stays intact."
        confirmLabel="Delete room"
        tone="danger"
        loading={busy}
      />
    </motion.div>
  );
}

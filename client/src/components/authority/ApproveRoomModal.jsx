import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Users, MapPin, CheckCircle2 } from 'lucide-react';
import cn from '../../lib/cn.js';
import { roomApi, gatepassApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { formatDate, formatRange } from '../../lib/format.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Textarea from '../ui/Textarea.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';

/**
 * Room picker for both approving a request and moving an approved one.
 *
 * A 409 from the server is shown inside the dialog and the list is refreshed,
 * so the user can pick again without losing the rest of their input.
 */
export default function ApproveRoomModal({ open, onClose, gatepass, mode = 'approve', onDone }) {
  const toast = useToast();
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [conflict, setConflict] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!gatepass) return;
    setRooms(null);
    setLoadError('');
    try {
      const data = await roomApi.availability({
        date: gatepass.requested_date,
        start_time: gatepass.start_time,
        end_time: gatepass.end_time,
        exclude_gatepass_id: gatepass.id,
      });
      setRooms(data);
    } catch (err) {
      setRooms([]);
      setLoadError(err.message);
    }
  }, [gatepass]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setComment('');
    setConflict('');
    load();
  }, [open, load]);

  const confirm = async () => {
    if (!selected) return;
    setSaving(true);
    setConflict('');
    try {
      const updated =
        mode === 'switch'
          ? await gatepassApi.switchRoom(gatepass.id, { room_id: selected })
          : await gatepassApi.approve(gatepass.id, {
              room_id: selected,
              ...(comment.trim() ? { comment: comment.trim() } : {}),
            });
      toast.success(
        mode === 'switch' ? `Moved to ${updated.room_name}.` : `Approved — ${updated.room_name} reserved.`
      );
      onDone?.(updated);
      onClose?.();
    } catch (err) {
      if (err.code === 'ROOM_CONFLICT') {
        // Someone took the slot while this dialog was open. Re-read and let them retry.
        setConflict(err.message);
        setSelected(null);
        load();
      } else {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!gatepass) return null;

  const available = (rooms || []).filter((r) => r.is_available).length;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      closeOnBackdrop={!saving}
      title={mode === 'switch' ? 'Move to another room' : 'Approve and reserve a room'}
      description={`${formatDate(gatepass.requested_date)} · ${formatRange(gatepass.start_time, gatepass.end_time)} · ${gatepass.visitor_name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={saving} disabled={!selected}>
            {mode === 'switch' ? 'Move meeting' : 'Approve request'}
          </Button>
        </>
      }
    >
      {conflict && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">That room was just taken</p>
            <p className="mt-0.5">{conflict}</p>
          </div>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
        >
          <span>{loadError}</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {rooms === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" rounded="rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No meeting rooms"
          description="There are no active rooms to book. An administrator can add one under Rooms."
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-500">
            {available} of {rooms.length} rooms free for this slot
          </p>
          <ul className="space-y-2">
            {rooms.map((room) => {
              const isSelected = selected === room.id;
              const busy = !room.is_available;
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(room.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      busy
                        ? 'cursor-not-allowed border-ink-100 bg-ink-50/70 opacity-80'
                        : isSelected
                          ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300'
                          : 'border-ink-200 bg-white hover:border-brand-200 hover:bg-brand-50/40'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300'
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && <CheckCircle2 size={12} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-ink-900">{room.name}</span>
                        <span className="text-xs text-ink-500">
                          {[room.building, room.floor && `Floor ${room.floor}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>

                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                        <span className="inline-flex items-center gap-1">
                          <Users size={13} aria-hidden="true" />
                          {room.capacity || '—'} seats
                        </span>
                        {room.amenities && <span className="truncate">{room.amenities}</span>}
                      </span>

                      {busy && room.occupied_by && (
                        <span className="mt-1.5 block text-xs font-medium text-danger">
                          Booked {formatRange(room.occupied_by.start_time, room.occupied_by.end_time)} by{' '}
                          {room.occupied_by.authority_name}
                          {room.occupied_by.visitor_name && ` (visitor: ${room.occupied_by.visitor_name})`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {mode === 'approve' && (
            <div className="mt-5 border-t border-ink-100 pt-5">
              <Textarea
                label="Note for the visitor (optional)"
                rows={2}
                placeholder="Please report to the main reception."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

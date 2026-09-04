import { useEffect, useState } from 'react';
import { roomApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Textarea from '../ui/Textarea.jsx';

const BLANK = { name: '', building: '', floor: '', capacity: '', amenities: '', is_active: true };

export default function RoomFormModal({ open, onClose, room, onSaved }) {
  const toast = useToast();
  const editing = Boolean(room);

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      room
        ? {
            name: room.name || '',
            building: room.building || '',
            floor: room.floor || '',
            capacity: room.capacity ?? '',
            amenities: room.amenities || '',
            is_active: room.is_active !== false,
          }
        : BLANK
    );
  }, [open, room]);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    const found = {};
    if (!form.name.trim()) found.name = 'Give the room a name.';
    if (form.capacity !== '' && (Number.isNaN(Number(form.capacity)) || Number(form.capacity) < 0)) {
      found.capacity = 'Enter a number of seats.';
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        building: form.building.trim() || undefined,
        floor: form.floor.trim() || undefined,
        capacity: form.capacity === '' ? 0 : Number(form.capacity),
        amenities: form.amenities.trim() || undefined,
        ...(editing ? { is_active: form.is_active } : {}),
      };
      const saved = editing ? await roomApi.update(room.id, payload) : await roomApi.create(payload);
      toast.success(editing ? 'Room updated.' : `${saved.name} added.`);
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      if (err.code === 'DUPLICATE') setErrors({ name: err.message });
      else if (err.details?.fields) setErrors(err.details.fields);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={!saving}
      title={editing ? 'Edit room' : 'Add a meeting room'}
      description="Rooms are offered to hosts when they approve a visitor request."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {editing ? 'Save changes' : 'Add room'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Room name" required autoFocus value={form.name} error={errors.name} onChange={set('name')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Building" value={form.building} error={errors.building} onChange={set('building')} />
          <Input label="Floor" value={form.floor} error={errors.floor} onChange={set('floor')} />
          <Input
            label="Capacity"
            type="number"
            min="0"
            value={form.capacity}
            error={errors.capacity}
            onChange={set('capacity')}
          />
        </div>
        <Textarea
          label="Amenities"
          rows={2}
          placeholder="Display, video conferencing, whiteboard"
          value={form.amenities}
          error={errors.amenities}
          onChange={set('amenities')}
        />
        {editing && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={set('is_active')}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            Available for booking
          </label>
        )}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

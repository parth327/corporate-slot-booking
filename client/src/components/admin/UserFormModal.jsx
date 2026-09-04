import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { ROLE_OPTIONS } from '../../lib/constants.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';

const BLANK = {
  name: '',
  email: '',
  role: 'AUTHORITY',
  mobile: '',
  department: '',
  designation: '',
  password: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserFormModal({ open, onClose, user, onSaved }) {
  const toast = useToast();
  const editing = Boolean(user);

  const [form, setForm] = useState(BLANK);
  const [sendInvite, setSendInvite] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSendInvite(true);
    setForm(
      user
        ? {
            name: user.name || '',
            email: user.email || '',
            role: user.role || 'AUTHORITY',
            mobile: user.mobile || '',
            department: user.department || '',
            designation: user.designation || '',
            password: '',
          }
        : BLANK
    );
  }, [open, user]);

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter a full name.';
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (!form.role) e.role = 'Choose a role.';
    if (form.mobile.trim()) {
      const digits = form.mobile.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) e.mobile = 'Enter a valid phone number.';
    }
    const needsPassword = !editing || form.password.length > 0;
    if (needsPassword) {
      if (form.password.length < 8) e.password = 'Use at least 8 characters.';
      else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        e.password = 'Include at least one letter and one digit.';
      }
    }
    return e;
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        mobile: form.mobile.trim() || undefined,
        department: form.department.trim() || undefined,
        designation: form.designation.trim() || undefined,
      };
      if (form.password) payload.password = form.password;
      if (!editing) payload.send_invite = sendInvite;

      const saved = editing
        ? await adminApi.updateUser(user.id, payload)
        : await adminApi.createUser(payload);

      toast.success(editing ? 'User updated.' : `${saved.name} added.`);
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      if (err.details?.fields) setErrors(err.details.fields);
      else if (err.code === 'DUPLICATE') setErrors({ email: err.message });
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
      title={editing ? 'Edit user' : 'Add a user'}
      description={
        editing
          ? 'Update this account. Leave the password blank to keep the current one.'
          : 'Create an account for an approval authority, guard or administrator.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            {editing ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.name} error={errors.name} onChange={set('name')} autoFocus />
          <Input
            label="Email address"
            type="email"
            required
            autoComplete="off"
            value={form.email}
            error={errors.email}
            onChange={set('email')}
          />
          <Select label="Role" required options={ROLE_OPTIONS} value={form.role} error={errors.role} onChange={set('role')} />
          <Input label="Mobile" type="tel" value={form.mobile} error={errors.mobile} onChange={set('mobile')} />
          <Input label="Department" value={form.department} error={errors.department} onChange={set('department')} />
          <Input label="Designation" value={form.designation} error={errors.designation} onChange={set('designation')} />
        </div>

        <Input
          label={editing ? 'New password' : 'Password'}
          type="password"
          autoComplete="new-password"
          required={!editing}
          hint={editing ? 'Leave blank to keep the current password.' : 'Min 8 characters, with a letter and a digit.'}
          value={form.password}
          error={errors.password}
          onChange={set('password')}
        />

        {!editing && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            Email them a welcome message with these credentials
          </label>
        )}

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

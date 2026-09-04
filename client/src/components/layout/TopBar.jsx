import { useEffect, useRef, useState } from 'react';
import { ExternalLink, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import cn from '../../lib/cn.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/toast.jsx';
import { authApi } from '../../lib/api.js';
import { initials } from '../../lib/format.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { fadeIn } from '../../lib/motion.js';
import Logo from './Logo.jsx';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';

function ChangePasswordModal({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ current_password: '', new_password: '', confirm: '' });
      setErrors({});
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.current_password) next.current_password = 'Enter your current password.';
    if (form.new_password.length < 8) next.new_password = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(form.new_password) || !/\d/.test(form.new_password)) {
      next.new_password = 'Include at least one letter and one digit.';
    }
    if (form.new_password !== form.confirm) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await authApi.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Password updated.');
      onClose();
    } catch (err) {
      if (err.details?.fields) setErrors(err.details.fields);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Use at least 8 characters, with a letter and a digit."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Update password
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.current_password}
          error={errors.current_password}
          onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.new_password}
          error={errors.new_password}
          onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          error={errors.confirm}
          onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
        />
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function TopBar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on an outside click or Esc.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 h-16 border-b border-ink-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block" />

          <div className="flex items-center gap-1">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:inline-flex"
            >
              Visitor form
              <ExternalLink size={14} aria-hidden="true" />
            </a>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
                  aria-hidden="true"
                >
                  {initials(user?.name)}
                </span>
                <span className="hidden text-sm font-medium text-ink-700 sm:inline">{user?.name}</span>
                <ChevronDown size={15} className="text-ink-400" aria-hidden="true" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    variants={fadeIn}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-pop"
                  >
                    <div className="border-b border-ink-100 px-4 py-3">
                      <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
                      <p className="truncate text-xs text-ink-400">{user?.email}</p>
                      <p className="mt-1 text-xs text-brand-600">{ROLE_LABELS[user?.role]}</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setPwOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-600 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:bg-ink-50"
                    >
                      <KeyRound size={16} aria-hidden="true" />
                      Change password
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      className={cn(
                        'flex w-full items-center gap-2.5 border-t border-ink-100 px-4 py-2.5 text-left text-sm',
                        'text-ink-600 transition-colors hover:bg-red-50 hover:text-danger focus-visible:outline-none focus-visible:bg-red-50'
                      )}
                    >
                      <LogOut size={16} aria-hidden="true" />
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}

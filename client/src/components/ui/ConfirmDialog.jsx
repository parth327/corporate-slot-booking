import { AlertTriangle, HelpCircle } from 'lucide-react';
import cn from '../../lib/cn.js';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

const TONE = {
  danger: { Icon: AlertTriangle, chip: 'bg-red-50 text-danger', variant: 'danger' },
  warning: { Icon: AlertTriangle, chip: 'bg-amber-50 text-warning', variant: 'primary' },
  brand: { Icon: HelpCircle, chip: 'bg-brand-50 text-brand-600', variant: 'primary' },
  success: { Icon: HelpCircle, chip: 'bg-emerald-50 text-success', variant: 'success' },
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'brand',
  loading = false,
  children,
}) {
  const { Icon, chip, variant } = TONE[tone] || TONE.brand;

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      size="sm"
      closeOnBackdrop={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', chip)}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-0.5">
          {title && <h3 className="text-base font-semibold text-ink-900">{title}</h3>}
          {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </Modal>
  );
}

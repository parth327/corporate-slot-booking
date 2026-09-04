import { cloneElement, isValidElement } from 'react';
import cn from '../../lib/cn.js';

/**
 * Label + control + one message line.
 *
 * When it wraps a single element it wires `aria-describedby` and `aria-invalid`
 * onto it, so the message is announced without every caller remembering to.
 */
export default function Field({
  label,
  error,
  hint,
  required = false,
  htmlFor,
  className,
  children,
  ...rest
}) {
  const messageId = htmlFor ? `${htmlFor}-msg` : undefined;
  const described = error || hint ? messageId : undefined;

  const control =
    isValidElement(children) && described
      ? cloneElement(children, {
          'aria-describedby': cn(children.props['aria-describedby'], described) || undefined,
          'aria-invalid': error ? true : children.props['aria-invalid'],
        })
      : children;

  return (
    <div className={cn('w-full', className)} {...rest}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {control}
      {error ? (
        <p id={messageId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-xs text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Shared control classes so Input, Select, Textarea and DatePicker match exactly. */
export const controlClass = (error) =>
  cn(
    'w-full rounded-xl border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400',
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
    'disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed',
    error
      ? 'border-danger focus-visible:ring-danger motion-safe:animate-shake'
      : 'border-ink-200 hover:border-ink-300'
  );

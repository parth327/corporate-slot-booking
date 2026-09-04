import { useId } from 'react';
import cn from '../../lib/cn.js';
import { controlClass } from './Field.jsx';
import { minutesBetween, durationLabel } from '../../lib/format.js';

const QUICK = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
];

function addMinutes(time, minutes) {
  const [h, m] = String(time || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function TimeRangePicker({
  label = 'Time',
  startValue = '',
  endValue = '',
  onChange,
  error,
  hint,
  required,
  disabled,
  className,
}) {
  const startId = useId();
  const endId = useId();
  const msgId = useId();

  const minutes = startValue && endValue ? minutesBetween(startValue, endValue) : 0;
  const invalidOrder = Boolean(startValue && endValue && minutes <= 0);
  const message = error || (invalidOrder ? 'The end time must be after the start time.' : null);
  const describedBy = message || hint ? msgId : undefined;

  const emit = (next) => onChange?.({ start_time: startValue, end_time: endValue, ...next });

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {minutes > 0 && (
          <span className="text-xs font-medium tabular-nums text-ink-500">{durationLabel(minutes)}</span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={startId}
          type="time"
          aria-label="Start time"
          aria-describedby={describedBy}
          aria-invalid={message ? true : undefined}
          required={required}
          aria-required={required || undefined}
          value={startValue}
          disabled={disabled}
          onChange={(e) => {
            const start = e.target.value;
            // Keep the range sane: a start past the end drags the end along.
            const end = endValue && minutesBetween(start, endValue) > 0 ? endValue : addMinutes(start, 60);
            emit({ start_time: start, end_time: end });
          }}
          className={cn(controlClass(message), 'h-10 flex-1')}
        />
        <span className="hidden shrink-0 text-ink-400 sm:inline" aria-hidden="true">
          –
        </span>
        <input
          id={endId}
          type="time"
          aria-label="End time"
          aria-describedby={describedBy}
          aria-invalid={message ? true : undefined}
          required={required}
          aria-required={required || undefined}
          value={endValue}
          disabled={disabled}
          onChange={(e) => emit({ end_time: e.target.value })}
          className={cn(controlClass(message), 'h-10 flex-1')}
        />
      </div>

      {startValue && !disabled && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => emit({ end_time: addMinutes(startValue, q.minutes) })}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                minutes === q.minutes
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-ink-200 text-ink-500 hover:bg-ink-50'
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {message ? (
        <p id={msgId} role="alert" className="mt-1.5 text-xs text-danger">
          {message}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

import { forwardRef, useId } from 'react';
import { Calendar } from 'lucide-react';
import cn from '../../lib/cn.js';
import Field, { controlClass } from './Field.jsx';

/**
 * A styled native date input — the native control gives us the platform picker,
 * which is far better on a phone than anything we would hand-roll.
 */
const DatePicker = forwardRef(function DatePicker(
  { label, error, hint, required, value, onChange, min, max, className, id, containerClassName, ...rest },
  ref
) {
  const auto = useId();
  const inputId = id || auto;

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        <Calendar
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
        <input
          ref={ref}
          id={inputId}
          type="date"
          value={value ?? ''}
          onChange={onChange}
          min={min}
          max={max}
          className={cn(controlClass(error), 'h-10 pl-9', className)}
          {...rest}
        />
      </div>
    </Field>
  );
});

export default DatePicker;

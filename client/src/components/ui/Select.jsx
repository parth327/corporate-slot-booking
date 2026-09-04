import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import cn from '../../lib/cn.js';
import Field, { controlClass } from './Field.jsx';

const Select = forwardRef(function Select(
  {
    label,
    error,
    hint,
    required,
    options = [],
    placeholder,
    className,
    id,
    containerClassName,
    ...rest
  },
  ref
) {
  const auto = useId();
  const selectId = id || auto;

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={selectId}
      className={containerClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-required={required || undefined}
          className={cn(controlClass(error), 'h-10 appearance-none pr-9', className)}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled={required}>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />
      </div>
    </Field>
  );
});

export default Select;

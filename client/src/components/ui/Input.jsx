import { forwardRef, useId } from 'react';
import cn from '../../lib/cn.js';
import Field, { controlClass } from './Field.jsx';

const Input = forwardRef(function Input(
  { label, error, hint, required, icon: Icon, className, id, containerClassName, ...rest },
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
        {Icon && (
          <Icon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-required={required || undefined}
          className={cn(controlClass(error), 'h-10', Icon && 'pl-9', className)}
          {...rest}
        />
      </div>
    </Field>
  );
});

export default Input;

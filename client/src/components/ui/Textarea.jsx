import { forwardRef, useId } from 'react';
import cn from '../../lib/cn.js';
import Field, { controlClass } from './Field.jsx';

const Textarea = forwardRef(function Textarea(
  { label, error, hint, required, rows = 4, className, id, containerClassName, ...rest },
  ref
) {
  const auto = useId();
  const areaId = id || auto;

  return (
    <Field
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={areaId}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        required={required}
        aria-required={required || undefined}
        className={cn(controlClass(error), 'resize-y py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </Field>
  );
});

export default Textarea;

import { createElement, forwardRef } from 'react';
import cn from '../../lib/cn.js';
import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary:
    'bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 text-white shadow-sm ' +
    'bg-[length:180%_180%] bg-left hover:bg-right ' +
    'hover:shadow-[0_12px_32px_-6px_rgba(79,110,247,0.55)] motion-safe:hover:-translate-y-0.5 ' +
    'motion-safe:transition-[background-position,transform,box-shadow] motion-safe:duration-500',
  secondary: 'bg-white text-ink-700 border border-ink-200 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100',
  danger: 'bg-danger text-white hover:bg-red-600 shadow-sm',
  success: 'bg-success text-white hover:bg-emerald-600 shadow-sm',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

const ICON_SIZE = { sm: 15, md: 16, lg: 18 };

const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconRight: IconRight,
    as = 'button',
    full = false,
    disabled = false,
    className,
    children,
    ...rest
  },
  ref
) {
  const isButton = as === 'button';
  const iconPx = ICON_SIZE[size] ?? ICON_SIZE.md;

  const props = {
    ref,
    className: cn(
      'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
      'disabled:opacity-50 disabled:pointer-events-none',
      'motion-safe:transition-[transform,box-shadow] motion-safe:active:scale-[.98]',
      VARIANTS[variant] || VARIANTS.primary,
      SIZES[size] || SIZES.md,
      full && 'w-full',
      className
    ),
    // Only a real <button> understands these.
    ...(isButton ? { type: rest.type || 'button', disabled: disabled || loading } : {}),
    ...(!isButton && (disabled || loading) ? { 'aria-disabled': true } : {}),
    ...(loading ? { 'aria-busy': true } : {}),
    ...rest,
  };

  // Keep the label mounted while loading so the button does not change width.
  const content = (
    <>
      {loading ? (
        <Spinner size={size === 'lg' ? 'md' : 'sm'} className="shrink-0" />
      ) : (
        Icon && <Icon size={iconPx} className="shrink-0" aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight size={iconPx} className="shrink-0" aria-hidden="true" />}
    </>
  );

  return createElement(as, props, content);
});

export default Button;

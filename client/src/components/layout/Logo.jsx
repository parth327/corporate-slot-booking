import { ShieldCheck } from 'lucide-react';
import cn from '../../lib/cn.js';

/**
 * `accent` adds a thin brand-coloured rule beneath the wordmark — a nod to
 * the hairline under Porsche Motorsport's logo, reinterpreted in GatePass's
 * own indigo rather than copied in their red. Off by default since it reads
 * as decorative flourish that only earns its place somewhere unhurried, like
 * a marketing header — not squeezed into the dense sidebar.
 *
 * `light` swaps the wordmark to white, for sitting on a dark hero photo
 * before the header solidifies. Deliberately an explicit prop rather than a
 * className hook reaching into the wordmark from outside — Logo's internal
 * markup (which span is the icon vs the text) is free to change without
 * breaking callers that just want "light" or not.
 *
 * `live` adds a small pulsing dot on the icon — a "the system is live/
 * connected" flourish, not a notification count, so it's opt-in and rare
 * (once per shell) rather than on every small Logo instance.
 */
export default function Logo({ className, showText = true, size = 'md', accent = false, light = false, live = false }) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const icon = size === 'sm' ? 16 : 18;
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className={cn('relative flex items-center justify-center rounded-xl bg-brand-600 text-white', box)}>
        <ShieldCheck size={icon} aria-hidden="true" />
        {live && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-white motion-safe:animate-pulse-dot"
          />
        )}
      </span>
      {showText && (
        <span className="flex flex-col justify-center">
          <span
            className={cn(
              'text-base font-semibold leading-none tracking-tight transition-colors duration-300',
              light ? 'text-white' : 'text-ink-900'
            )}
          >
            GatePass
          </span>
          {accent && (
            <span
              className={cn(
                'mt-1.5 h-[2px] w-6 rounded-full transition-colors duration-300',
                light ? 'bg-white' : 'bg-brand-500'
              )}
              aria-hidden="true"
            />
          )}
        </span>
      )}
    </span>
  );
}

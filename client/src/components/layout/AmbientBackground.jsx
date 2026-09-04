import cn from '../../lib/cn.js';
import ParticleCanvas from './ParticleCanvas.jsx';

/**
 * Blurred, slowly-drifting gradient orbs behind the page content — the
 * ambient motion language borrowed from the reference site, reinterpreted in
 * GatePass's own brand hue rather than copied in their blue.
 *
 * `variant="hero"` (public, first-impression pages) is large, vivid, and
 * pairs with a live particle canvas — the reference site's own literal
 * technique, worth the continuous animation cost on a page a visitor looks
 * at for a few seconds. `variant="subtle"` (signed-in dashboards, next to
 * real content people read all day) is quieter and orbs-only — no canvas
 * animation loop running behind a data table someone keeps open for hours.
 *
 * Deliberately `absolute` (not `fixed` + negative z-index) and rendered as
 * the *first* child of a `relative` shell: later siblings then sit on top of
 * it through plain DOM paint order, with no z-index stacking-context tricks
 * that a solid `bg-ink-50` on the shell could otherwise silently paint over.
 *
 * `prefers-reduced-motion` is handled globally in index.css for the CSS-
 * animated orbs, and by ParticleCanvas itself for the canvas loop.
 */
export default function AmbientBackground({ variant = 'subtle', className }) {
  const hero = variant === 'hero';

  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {hero && <ParticleCanvas className="absolute inset-0 hidden h-full w-full sm:block" />}

      <div
        className={cn(
          'absolute animate-float-orb rounded-full bg-gradient-to-br from-brand-300 to-brand-600 blur-3xl',
          hero ? '-left-32 -top-36 h-[30rem] w-[30rem] opacity-45' : '-left-20 -top-24 h-72 w-72 opacity-[0.16]'
        )}
      />
      <div
        className={cn(
          'absolute animate-float-orb rounded-full bg-gradient-to-br from-info to-brand-500 blur-3xl [animation-delay:-6s]',
          hero ? '-right-28 -bottom-40 h-[28rem] w-[28rem] opacity-40' : '-right-16 -bottom-28 h-64 w-64 opacity-[0.14]'
        )}
      />
      <div
        className={cn(
          'absolute animate-float-orb rounded-full bg-gradient-to-br from-brand-200 to-brand-500 blur-3xl [animation-delay:-11s]',
          hero ? 'right-[10%] top-[36%] h-80 w-80 opacity-35' : 'right-[15%] top-[42%] h-52 w-52 opacity-[0.12]'
        )}
      />
    </div>
  );
}

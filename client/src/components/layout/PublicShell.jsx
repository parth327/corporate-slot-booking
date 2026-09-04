import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import cn from '../../lib/cn.js';
import { reduceMotion } from '../../lib/motion.js';
import AmbientBackground from './AmbientBackground.jsx';
import Logo from './Logo.jsx';

/** rest/hover pair for the nav link's underline draw. */
const underline = {
  rest: { scaleX: reduceMotion ? 1 : 0 },
  hover: { scaleX: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

const SCROLL_THRESHOLD = 80;

/** True once the page has scrolled past `SCROLL_THRESHOLD`. */
function useScrolled(enabled) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);
  return scrolled;
}

/**
 * `overHero` floats the header, transparent, over a full-bleed hero image —
 * the nav pattern on racing.porsche.com, where the bar reads on top of the
 * photograph until the visitor scrolls, then solidifies. Reinterpreted here
 * in GatePass's own light theme rather than Porsche's dark one: "transparent
 * with light text over a dark photo, solid white once scrolled" is the part
 * of the pattern that's brand-agnostic; the color story stays GatePass's own.
 * Pages with no hero (`overHero` false, the default) keep the plain solid
 * header GatePass has always had — there's nothing under it to float over.
 */
export default function PublicShell({ children, narrow = false, overHero = false }) {
  const scrolled = useScrolled(overHero);
  const transparent = overHero && !scrolled;

  return (
    <div className="relative flex min-h-screen flex-col bg-ink-50">
      <AmbientBackground variant="hero" />

      {/* Soft brand wash behind the fold — only where there is no hero photo to wash over it. */}
      {!overHero && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand-50 via-brand-50/40 to-transparent"
        />
      )}

      <header
        className={cn(
          'z-40 transition-colors duration-300',
          overHero ? 'fixed inset-x-0 top-0' : 'relative border-b border-ink-100/80 bg-white/70 backdrop-blur',
          transparent && 'border-b border-transparent bg-transparent',
          overHero && !transparent && 'border-b border-ink-100/80 bg-white/90 backdrop-blur shadow-sm'
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className={cn(
              'rounded-xl focus-visible:outline-none focus-visible:ring-2',
              transparent ? 'focus-visible:ring-white' : 'focus-visible:ring-brand-500'
            )}
            aria-label="GatePass home"
          >
            <Logo accent={overHero} light={transparent} live />
          </Link>
          <motion.div initial="rest" animate="rest" whileHover="hover" whileFocus="hover" className="relative">
            <Link
              to="/login"
              className={cn(
                'block rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2',
                transparent
                  ? 'text-white/85 hover:text-white focus-visible:ring-white'
                  : 'text-ink-600 hover:text-brand-700 focus-visible:ring-brand-500'
              )}
            >
              Staff sign in
            </Link>
            <motion.span
              variants={underline}
              style={{ transformOrigin: 'left' }}
              className={cn(
                'pointer-events-none absolute inset-x-3 -bottom-0.5 h-px',
                transparent ? 'bg-white' : 'bg-brand-600'
              )}
              aria-hidden="true"
            />
          </motion.div>
        </div>
      </header>

      <main
        className={cn(
          'relative z-10 mx-auto w-full flex-1 px-4 sm:px-6',
          overHero ? 'pb-8 sm:pb-12' : 'py-8 sm:py-12',
          narrow ? 'max-w-md' : 'max-w-5xl'
        )}
      >
        {children}
      </main>

      <footer className="relative z-10 border-t border-ink-100 bg-white/60 py-5">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-ink-400 sm:px-6">
          GatePass — visitor management &amp; meeting room booking
        </div>
      </footer>
    </div>
  );
}

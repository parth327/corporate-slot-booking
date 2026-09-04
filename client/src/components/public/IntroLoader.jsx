import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ShieldCheck } from 'lucide-react';
import { reduceMotion } from '../../lib/motion.js';

const SESSION_KEY = 'gatepass.introPlayed';

/**
 * A full-screen branded overlay that wipes away via an animated `clip-path`
 * to reveal the page beneath — the technique racing.porsche.com's own
 * homepage loader uses (confirmed by inspecting the live site: its loader
 * element ships with `style="clip-path:inset(0 0 0% 0)"` as its pre-animation
 * state, the same CSS mechanism this component animates). A `clip-path` wipe
 * reads as the page itself being uncovered, rather than a layer simply
 * fading out on top of it — the difference is subtle but is what gives this
 * kind of intro its "reveal" quality instead of feeling like a plain loading
 * spinner.
 *
 * Gated behind sessionStorage so it plays once per browser session, not on
 * every visit back to `/` — an intro this deliberate earns its keep on a
 * first impression, not on someone's fifth visit today.
 */
export default function IntroLoader() {
  const overlayRef = useRef(null);
  const [mounted, setMounted] = useState(() => {
    try {
      return !sessionStorage.getItem(SESSION_KEY);
    } catch {
      // Storage unavailable (private browsing, etc.) — play it every time
      // rather than crash; worst case is a slightly repeated intro.
      return true;
    }
  });

  useLayoutEffect(() => {
    if (!mounted) return undefined;

    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* ignore — see above */
    }

    if (reduceMotion) {
      setMounted(false);
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        delay: 0.35, // a beat so the intro doesn't feel like it's rushing out
        onComplete: () => setMounted(false),
      });

      tl.to('.intro-mark', { autoAlpha: 0, y: -8, duration: 0.4, ease: 'power2.out' })
        // The wipe itself: inset(top right bottom left). Animating only the
        // bottom value from 0% to 100% clips the overlay away from its own
        // bottom edge upward — the page beneath is uncovered top-down, like
        // a blind lifting, rather than the overlay just disappearing.
        .to(
          overlayRef.current,
          { clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'power4.inOut' },
          '-=0.1'
        );
    });

    return () => {
      ctx.revert();
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      style={{ clipPath: 'inset(0 0 0% 0)' }}
    >
      <div className="intro-mark flex items-center gap-2 text-white">
        <ShieldCheck size={22} aria-hidden="true" />
        <span className="text-lg font-bold tracking-tight">GatePass</span>
      </div>
    </div>
  );
}

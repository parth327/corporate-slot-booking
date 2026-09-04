import { useLayoutEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Registering a plugin is a one-time, module-level operation in GSAP — it
// must happen before any component tries to use `scrollTrigger:` in a
// tween, and doing it here (not inside the hook body) guarantees it runs
// exactly once no matter how many times useLenis() mounts.
gsap.registerPlugin(ScrollTrigger);

/**
 * Wires Lenis (inertia/momentum smooth-scroll) into GSAP's own frame loop.
 *
 * THE CORE PROBLEM this solves: Lenis intercepts the browser's native scroll
 * and re-implements it with easing, driven by its own requestAnimationFrame
 * loop. ScrollTrigger, meanwhile, listens for the native `scroll` event to
 * know when to update pinned/scrubbed animations. Once Lenis is smoothing
 * scroll, the page's `scrollTop` changes *between* native scroll events (or
 * the events stop firing in a way ScrollTrigger expects), so ScrollTrigger's
 * math goes stale and pins/scrub animations visibly lag or stutter.
 *
 * THE FIX has two halves:
 *   1. Tell ScrollTrigger to recalculate on every Lenis tick, via
 *      `lenis.on('scroll', ScrollTrigger.update)` — this replaces the
 *      native scroll event as ScrollTrigger's source of truth.
 *   2. Drive Lenis's own animation loop from `gsap.ticker` instead of its
 *      default internal `requestAnimationFrame` — this puts Lenis's easing
 *      step and GSAP's tween/ScrollTrigger updates on the *same* frame
 *      clock, in the same order, every frame. Two independent rAF loops
 *      racing each other is the actual root cause of jank when you mix a
 *      smooth-scroll library with a scroll-linked animation library; one
 *      shared clock removes the race entirely.
 *
 * `gsap.ticker.lagSmoothing(0)` disables GSAP's default behaviour of
 * silently "catching up" after a long frame (e.g. a tab regaining focus) by
 * skipping time — for scroll-driven animation that catch-up reads as a
 * visible jump cut. Scroll position should always reflect exactly where the
 * user scrolled to, never an animated-away approximation of it.
 *
 * Call this once, at the root of the app that owns the scrollable page —
 * every ScrollTrigger created by any descendant component automatically
 * participates, no per-component wiring needed.
 */
export default function useLenis() {
  useLayoutEffect(() => {
    const lenis = new Lenis({
      duration: 1.2, // how long an eased scroll "settles" for, in seconds
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo-out: fast start, soft landing
      smoothWheel: true,
      touchMultiplier: 1.5,
    });

    lenis.on('scroll', ScrollTrigger.update);

    // `time` arrives in seconds from gsap.ticker; Lenis's own `raf()` wants
    // milliseconds, matching what `performance.now()` would give it.
    const syncLenisToGsapTicker = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(syncLenisToGsapTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(syncLenisToGsapTicker);
      lenis.destroy();
    };
  }, []);
}

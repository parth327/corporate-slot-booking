import useLenis from '../lib/useLenis.js';
import HeroSection from './components/HeroSection.jsx';
import ScrubSection from './components/ScrubSection.jsx';
import ParallaxSection from './components/ParallaxSection.jsx';

/**
 * Root of the cinematic showcase — the "App.jsx" of this foundation.
 *
 * Split out from the host project's own App.jsx deliberately: this is a
 * self-contained scroll experience (its own Lenis instance, its own dark
 * full-bleed sections) meant to be lifted into a fresh project wholesale —
 * mixing it into an app that already owns global scroll/layout concerns is
 * exactly the kind of thing that causes two smooth-scroll libraries, or two
 * Lenis instances, to fight each other. Mounted at a plain route with no
 * surrounding chrome (see the router wiring) so it owns the full viewport.
 */
export default function CinematicShowcase() {
  // Runs once, in a useLayoutEffect inside the hook itself, so Lenis takes
  // over the scroll before the browser paints the first frame — see
  // hooks/useLenis.js for the full mechanics of the Lenis <-> GSAP wiring.
  useLenis();

  return (
    <main className="bg-neutral-950">
      <HeroSection />
      <ScrubSection />
      <ParallaxSection />

      <footer className="flex h-[40vh] items-center justify-center bg-black text-white/40">
        <p className="text-xs uppercase tracking-[0.3em]">End of the scroll</p>
      </footer>
    </main>
  );
}

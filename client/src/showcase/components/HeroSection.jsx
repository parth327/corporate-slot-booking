import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Splits a headline into words, each wrapped in a fixed-height, overflow-
 * hidden "mask" span. The word itself sits in an inner span that GSAP moves
 * from below the mask's edge up to its resting position — the mask clips
 * everything outside it, so the animation reads as the word rising up into
 * view from nothing, not simply fading or sliding in over other content.
 * This is the same technique behind most "cinematic" headline reveals
 * (Porsche, Apple product pages, big editorial sites).
 */
function MaskedWords({ text, className }) {
  const words = text.split(' ');
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="reveal-mask inline-block overflow-hidden pb-[0.1em] align-bottom"
          aria-hidden="true"
        >
          {/* This is the element GSAP actually animates — one per word. */}
          <span className="reveal-word inline-block will-change-transform">
            {word}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function HeroSection() {
  // Scope the GSAP context to this section's DOM subtree — .revert() on
  // cleanup then undoes every tween/animation this component created, so
  // nothing leaks or double-fires if the component unmounts and remounts
  // (React StrictMode's dev-only double-invoke included).
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // A single timeline sequences the whole reveal: headline words rise
      // in a loose stagger, then the subtitle and scroll cue fade in after,
      // rather than everything appearing simultaneously. `defaults` applies
      // shared easing/duration to every tween added below unless overridden.
      const tl = gsap.timeline({
        defaults: { ease: 'power4.out' },
        delay: 0.2, // a beat before anything moves, so the reveal reads as intentional
      });

      tl.from('.reveal-word', {
        yPercent: 130,
        duration: 1.1,
        stagger: 0.06, // each word starts slightly after the previous one
      })
        .from(
          '.hero-subtitle',
          { autoAlpha: 0, y: 16, duration: 0.7 },
          '-=0.5' // starts 0.5s before the previous tween finishes, for overlap
        )
        .from('.hero-scroll-cue', { autoAlpha: 0, duration: 0.6 }, '-=0.2');
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-black text-white"
    >
      {/* Ambient depth — a soft off-center glow, not a literal photo, keeps
          this foundation dependency-free while still reading as "cinematic"
          rather than flat. Swap for a full-bleed video/image layer freely;
          it only needs `absolute inset-0 -z-10` to sit behind the content. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(255,255,255,0.08),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent to-black"
      />

      <h1 className="max-w-5xl px-6 text-center text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
        <MaskedWords text="Engineered for the edge" />
      </h1>

      <p className="hero-subtitle mt-6 max-w-md px-6 text-center text-sm text-white/60 sm:text-base">
        A cinematic scroll experience, built on Lenis and GSAP ScrollTrigger.
      </p>

      <div className="hero-scroll-cue absolute bottom-10 flex flex-col items-center gap-2 text-white/50">
        <span className="text-[11px] font-medium uppercase tracking-[0.3em]">Scroll</span>
        <span className="h-10 w-px bg-gradient-to-b from-white/50 to-transparent" />
      </div>
    </section>
  );
}

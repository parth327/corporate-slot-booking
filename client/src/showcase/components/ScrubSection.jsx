import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * The "pin and scrub" centerpiece: the section locks in place once it
 * reaches the center of the viewport, and further scrolling drives a
 * central box from 20% width up to filling the screen — scroll position
 * becomes the animation's timeline scrubber rather than time.
 *
 * `scrub: true` (or a number) is what makes this "scroll-linked" instead of
 * "scroll-triggered": a normal ScrollTrigger tween plays once, on its own
 * time, when triggered. A scrubbed tween's progress is bound directly to
 * scroll position — scroll halfway through the trigger's range and the
 * tween is exactly halfway done, scroll backward and it reverses. Passing a
 * number (`scrub: 1` here) adds that many seconds of easing "catch-up" so
 * the animation smooths out fast/jittery scroll input instead of snapping
 * frame-for-frame with it — 1 pairs well with Lenis's own inertia so the
 * two don't fight over how "smoothed" the motion feels.
 */
export default function ScrubSection() {
  const sectionRef = useRef(null);
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(boxRef.current, {
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        ease: 'none', // scrubbed tweens should be linear — scroll position supplies the easing
        scrollTrigger: {
          trigger: sectionRef.current,
          // Pin engages once the section's own center crosses the
          // viewport's center — not the moment it first enters the screen.
          start: 'center center',
          // How much additional scroll distance the pin holds for, and the
          // scale-up plays out over — measured relative to the viewport
          // height. Bigger = a slower, more deliberate reveal.
          end: '+=150%',
          pin: true,
          scrub: 1,
          // pinSpacing (default true) inserts exactly enough space after
          // the pinned element so content below isn't yanked upward when
          // the pin releases — normally invisible, worth knowing about if
          // this section's neighbours ever seem to jump.
        },
      });

      // A secondary scrubbed tween on the same trigger — the caption fades
      // out over just the *first* portion of the scroll range (`end` here
      // is local to this tween's own scrollTrigger, shorter than the box's),
      // so it's gone well before the box finishes covering the screen.
      gsap.to('.scrub-caption', {
        autoAlpha: 0,
        y: -20,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'center center',
          end: '+=50%',
          scrub: 1,
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-neutral-950">
      <div className="scrub-caption absolute top-16 z-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Keep scrolling</p>
        <p className="mt-1 text-sm text-white/70">Watch the frame take over</p>
      </div>

      <div
        ref={boxRef}
        className="relative aspect-video overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: '20%' }}
      >
        <div className="h-full w-full bg-gradient-to-br from-sky-500 via-indigo-600 to-neutral-900" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70 sm:text-sm">
            The Scrub
          </span>
        </div>
      </div>
    </section>
  );
}

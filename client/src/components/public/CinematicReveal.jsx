import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * A single full-bleed, pinned "reveal" moment — a real landing photo scales
 * from a small box up to filling the screen as the visitor scrolls past.
 * Same mechanism as the showcase's Scrub section (client/src/showcase/
 * components/ScrubSection.jsx has the fuller commentary on why `start:
 * 'center center'` + `scrub` produces a pin-and-scale rather than a normal
 * one-shot animation) — reused here against this page's own imagery and
 * copy instead of a placeholder gradient.
 *
 * `ml-[calc(50%-50vw)] mr-[calc(50%-50vw)]` is the same full-bleed trick
 * HeroGallery uses to break out of PublicShell's centered, padded
 * container — see that component's comment for why it has to be a single
 * combined calc() rather than two separate offsets.
 */
export default function CinematicReveal({ image, alt, eyebrow, heading }) {
  const sectionRef = useRef(null);
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(boxRef.current, {
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'center center',
          end: '+=120%',
          pin: true,
          scrub: 1,
        },
      });

      // The caption sits outside the scaling box (not inside it) precisely
      // so it never has to grow along with the photo — it just fades out
      // early, well before the image finishes covering the screen.
      gsap.to('.reveal-caption', {
        autoAlpha: 0,
        y: -24,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'center center',
          end: '+=40%',
          scrub: 1,
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] flex h-screen w-screen items-center justify-center overflow-hidden bg-black"
    >
      <div className="reveal-caption absolute inset-x-0 top-14 z-10 mx-auto max-w-lg px-6 text-center sm:top-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">{eyebrow}</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-white [text-wrap:balance] drop-shadow-md sm:text-4xl">
          {heading}
        </h2>
      </div>

      <div
        ref={boxRef}
        className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: '24%' }}
      >
        <img src={image} alt={alt} className="h-full w-full object-cover" draggable={false} />
      </div>
    </section>
  );
}

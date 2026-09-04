import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * The same three-step journey the sidebar's "What happens next" list tells
 * in words (see PublicRequest.jsx `STEPS`), told again here in photos that
 * drift past at independent speeds as the visitor scrolls — reinforcement,
 * not new information. See client/src/showcase/components/ParallaxSection.jsx
 * for the full mechanics comment on why each item gets its own ScrollTrigger
 * scoped to `top bottom` -> `bottom top` rather than one trigger for the
 * whole section.
 */
const ITEMS = [
  {
    image: '/images/1.jpeg',
    alt: 'A visitor scanning a gatepass QR code at a security turnstile',
    caption: 'Check in with a single scan',
    speed: 0.8,
    className: 'col-span-6 col-start-1 sm:col-span-5',
  },
  {
    image: '/images/3.jpeg',
    alt: 'A boardroom screen showing the meeting room booking calendar',
    caption: 'Approved by your host in minutes',
    speed: 1.35,
    className: 'col-span-6 col-start-7 mt-28 sm:col-span-4 sm:col-start-8',
  },
  {
    image: '/images/6.jpeg',
    alt: 'A glass-walled meeting room set up for a project review',
    caption: 'Your room, reserved automatically',
    speed: 1.0,
    className: 'col-span-6 col-start-3 mt-16 sm:col-span-4',
  },
];

export default function CinematicParallax() {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.parallax-photo').forEach((el) => {
        const speed = parseFloat(el.dataset.speed) || 1;
        const travel = 100 * (speed - 1);
        gsap.fromTo(
          el,
          { y: -travel },
          {
            y: travel,
            ease: 'none',
            scrollTrigger: {
              trigger: el,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          }
        );
      });

      gsap.to('.parallax-heading', {
        yPercent: -20,
        autoAlpha: 0.4,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] w-screen overflow-hidden bg-black py-28 sm:py-36"
    >
      <div className="parallax-heading sticky top-20 z-10 mx-auto max-w-2xl px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">How it works</p>
        <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
          From request to gate pass
        </h2>
      </div>

      <div className="relative mx-auto mt-24 grid max-w-5xl grid-cols-12 gap-5 px-6 sm:mt-32 sm:gap-8">
        {ITEMS.map(({ image, alt, caption, speed, className }) => (
          <div key={image} data-speed={speed} className={`parallax-photo ${className}`}>
            <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl shadow-xl">
              <img src={image} alt={alt} className="h-full w-full object-cover" draggable={false} />
            </div>
            <p className="mt-3 text-sm font-medium text-white/80">{caption}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Each `.parallax-item` in this section moves vertically by an amount
 * proportional to its own `data-speed`, over its own scroll-through range —
 * not the page's total scroll range. This is the important difference from
 * the Scrub section: there, one ScrollTrigger drives one tween over a
 * fixed, deliberately long scroll distance (`end: '+=150%'`). Here, every
 * element gets its *own* ScrollTrigger scoped to exactly when that element
 * is passing through the viewport (`start: 'top bottom'` -> `end: 'bottom
 * top'`), so each one starts and finishes its motion independently as the
 * user scrolls past it, regardless of how tall the page is overall.
 *
 * `speed > 1` moves faster than native scroll (feels like it's closer to
 * the viewer); `speed < 1` moves slower (feels farther away, like distant
 * background layers do in real parallax). `speed` values are picked per
 * element below via the `data-speed` attribute rather than hard-coded in
 * JS, so the depth of each item is visible right there in the markup.
 */
const PARALLAX_ITEMS = [
  { id: 'a', speed: 0.6, className: 'col-span-5 col-start-1 row-start-1', tone: 'from-rose-500 to-orange-400' },
  { id: 'b', speed: 1.4, className: 'col-span-4 col-start-8 row-start-1 mt-40', tone: 'from-sky-500 to-blue-600' },
  { id: 'c', speed: 0.9, className: 'col-span-4 col-start-3 row-start-2 mt-24', tone: 'from-emerald-500 to-teal-600' },
  { id: 'd', speed: 1.7, className: 'col-span-3 col-start-9 row-start-2 mt-10', tone: 'from-violet-500 to-fuchsia-600' },
];

export default function ParallaxSection() {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const items = gsap.utils.toArray('.parallax-item');
      items.forEach((el) => {
        const speed = parseFloat(el.dataset.speed) || 1;
        // The further from speed=1 (native scroll), the larger the vertical
        // travel — this is the whole parallax illusion in one line.
        const travel = 120 * (speed - 1);

        gsap.fromTo(
          el,
          { y: -travel },
          {
            y: travel,
            ease: 'none',
            scrollTrigger: {
              trigger: el,
              start: 'top bottom', // the moment this element's top edge enters the viewport
              end: 'bottom top', // the moment its bottom edge exits at the top
              scrub: true, // no easing lag here — depth reads better tied 1:1 to scroll
            },
          }
        );
      });

      // The heading itself gets a much gentler, independent scrub-fade as
      // the section is left behind, so it doesn't just vanish abruptly.
      gsap.to('.parallax-heading', {
        yPercent: -30,
        autoAlpha: 0.3,
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
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-neutral-950 py-40 text-white">
      <div className="parallax-heading sticky top-24 z-10 mx-auto max-w-3xl px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Depth</p>
        <h2 className="mt-3 text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl">
          Every layer moves
          <br />
          at its own speed
        </h2>
      </div>

      <div className="relative mx-auto mt-32 grid max-w-6xl grid-cols-12 gap-6 px-6">
        {PARALLAX_ITEMS.map(({ id, speed, className, tone }) => (
          <div key={id} data-speed={speed} className={`parallax-item ${className}`}>
            <div className={`aspect-square w-full rounded-2xl bg-gradient-to-br ${tone} shadow-xl`} />
            <p className="mt-3 text-xs font-medium uppercase tracking-wider text-white/50">
              speed {speed.toFixed(1)}×
            </p>
          </div>
        ))}
      </div>

      {/* Generous bottom padding — every item's own scroll-through range
          needs the section to actually be tall enough to scroll past. */}
      <div className="h-40" />
    </section>
  );
}

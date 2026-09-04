import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import cn from '../../lib/cn.js';
import { reduceMotion, heroWordContainer, heroWord } from '../../lib/motion.js';
import usePolling from '../../hooks/usePolling.js';

/**
 * Full-bleed autoplaying showcase for the visitor-facing landing page.
 *
 * Motion language borrowed from large editorial/automotive sites: an
 * edge-to-edge photographic hero, a bold uppercase headline that discloses
 * word by word (clip-masked rise, not a fade) rather than appearing as one
 * block, and a slow Ken-Burns zoom on the image running on its own timer so
 * it never resets mid-crossfade. Autoplay pauses on hover/focus and while the
 * tab is hidden; everything collapses to an instant, static state when the OS
 * asks for reduced motion.
 */
const SLIDES = [
  { src: '/images/1.jpeg', alt: 'A visitor scanning a gatepass QR code at a security turnstile' },
  { src: '/images/4.jpeg', alt: 'A GatePass visitor badge with photo, company and a scannable QR code' },
  { src: '/images/3.jpeg', alt: 'A boardroom screen showing the meeting room booking calendar' },
  { src: '/images/6.jpeg', alt: 'A glass-walled meeting room set up for a project review' },
  { src: '/images/7.jpeg', alt: 'A circular glass meeting table in front of a live analytics screen' },
  { src: '/images/2.jpeg', alt: 'An open-plan office with city views and collaborative seating' },
  { src: '/images/5.jpeg', alt: 'A bright open-plan workspace with private meeting pods' },
];

const AUTOPLAY_MS = 5000;

/** Splits a headline into words, each individually revealable. */
function Headline({ text, as: As = 'h1', className }) {
  const words = text.split(' ');
  return (
    <motion.div
      variants={heroWordContainer}
      initial="initial"
      animate="animate"
      className={cn('flex flex-wrap', className)}
      aria-label={text}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="mr-[0.28em] overflow-hidden pb-1 last:mr-0" aria-hidden="true">
          <motion.span variants={heroWord} className="inline-block will-change-transform">
            {word}
          </motion.span>
        </span>
      ))}
    </motion.div>
  );
}

export default function HeroGallery({
  className,
  fullBleed = false,
  headline,
  subtitle,
  showScrollCue = false,
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dirRef = useRef(1);

  const advance = useCallback((delta) => {
    dirRef.current = delta;
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }, []);

  usePolling(() => advance(1), AUTOPLAY_MS, !paused);

  const goTo = (next) => {
    dirRef.current = next > index ? 1 : -1;
    setIndex(next);
  };

  return (
    <div
      className={cn(
        'group relative isolate w-full overflow-hidden bg-ink-900',
        fullBleed
          ? // Breaks out of the shell's max-w container to run edge to edge.
            // `calc(50% - 50vw)` — not `left-1/2` paired with `-mx-[50vw]` —
            // is the version of this trick that is actually correct at every
            // viewport width: `50%` resolves against the *parent's* width
            // while `50vw` resolves against the *viewport*, and only a single
            // calc() that combines both in one expression cancels the
            // parent's centering offset exactly. Two separate parent-relative
            // and viewport-relative offsets only *happen* to cancel when the
            // parent is nearly as wide as the viewport (true on desktop,
            // false on mobile, where the shell's padding is a much larger
            // share of a narrow screen) — that mismatch clipped the header
            // and hero text off the right edge on phones.
            'w-screen ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] h-[68vh] min-h-[26rem] sm:h-[74vh] sm:min-h-[30rem]'
          : 'h-56 rounded-2xl shadow-pop sm:h-72 lg:h-80',
        className
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={SLIDES[index].src}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.9, ease: 'easeInOut' }}
        >
          <motion.img
            src={SLIDES[index].src}
            alt={SLIDES[index].alt}
            className="h-full w-full object-cover"
            initial={{ scale: reduceMotion ? 1 : 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : AUTOPLAY_MS / 1000 + 1, ease: 'linear' }}
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Grounds text over a bright photo — heavier at the bottom for the caption/headline. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          fullBleed
            ? 'bg-gradient-to-t from-ink-900/90 via-ink-900/30 to-ink-900/40'
            : 'bg-gradient-to-t from-ink-900/80 via-ink-900/10 to-transparent'
        )}
        aria-hidden="true"
      />

      {fullBleed && headline ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-start justify-end px-4 pb-16 sm:px-6 sm:pb-20 lg:px-10">
          <div className="mx-auto w-full max-w-5xl">
            <Headline
              text={headline}
              className="text-3xl font-bold uppercase leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
            />
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 max-w-lg text-sm text-white/75 sm:text-base"
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </div>
      ) : (
        !fullBleed && (
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <p className="text-base font-semibold text-white sm:text-lg">
              Modern spaces, ready when you arrive
            </p>
          </div>
        )
      )}

      {showScrollCue && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: reduceMotion ? 0 : [0, 6, 0] }}
          transition={{ opacity: { delay: 1, duration: 0.5 }, y: { delay: 1, duration: 1.6, repeat: Infinity } }}
        >
          <ChevronDown size={22} className="text-white/70" aria-hidden="true" />
        </motion.div>
      )}

      <div
        className={cn(
          'absolute right-4 flex gap-1.5 sm:right-6',
          fullBleed ? 'bottom-5' : 'bottom-4 sm:bottom-6'
        )}
        role="tablist"
        aria-label="Gallery slides"
      >
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show slide ${i + 1} of ${SLIDES.length}`}
            onClick={() => goTo(i)}
            className={cn(
              'h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
            )}
          />
        ))}
      </div>
    </div>
  );
}

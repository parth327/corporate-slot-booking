/**
 * Shared Framer Motion variants.
 *
 * Read the reduced-motion preference once at module load and flatten every
 * variant when it is set, so no component has to remember to check.
 */
export const reduceMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const EASE = [0.22, 1, 0.36, 1];

export const transition = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE };

const flat = { initial: {}, animate: {}, exit: {} };

export const pageVariants = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
      exit: { opacity: 0, y: -6, transition: { duration: 0.15, ease: EASE } },
    };

export const listContainer = reduceMotion
  ? flat
  : {
      initial: {},
      animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
      exit: {},
    };

export const listItem = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } },
      exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
    };

export const fadeIn = reduceMotion
  ? flat
  : {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.18 } },
      exit: { opacity: 0, transition: { duration: 0.12 } },
    };

export const scaleIn = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 24 } },
      exit: { opacity: 0, scale: 0.95, transition: { duration: 0.12 } },
    };

export const slideUp = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
      exit: { opacity: 0, y: 16, transition: { duration: 0.14 } },
    };

export const backdropVariants = reduceMotion
  ? flat
  : {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.16 } },
      exit: { opacity: 0, transition: { duration: 0.14 } },
    };

export const modalVariants = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, scale: 0.96, y: 12 },
      animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 28 } },
      exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.14 } },
    };

/** Right-hand drawer; on mobile the Drawer component overrides this to slide up. */
export const drawerVariants = reduceMotion
  ? flat
  : {
      initial: { x: '100%' },
      animate: { x: 0, transition: { type: 'spring', stiffness: 320, damping: 34 } },
      exit: { x: '100%', transition: { duration: 0.18, ease: EASE } },
    };

// --- cinematic hero / scroll-reveal primitives -----------------------------
// Modelled on the reveal language of large editorial/automotive sites: a
// display headline that discloses word by word rather than fading in as one
// block, and content further down the page that only animates once it is
// actually scrolled into view rather than all at once on mount.

/** Parent for a word-by-word headline reveal — pair with `heroWord` per word. */
export const heroWordContainer = reduceMotion
  ? flat
  : {
      initial: {},
      animate: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
    };

/** One word inside `heroWordContainer` — clip-masked rise, not a plain fade. */
export const heroWord = reduceMotion
  ? flat
  : {
      initial: { y: '110%' },
      animate: { y: '0%', transition: { duration: 0.7, ease: EASE } },
    };

/**
 * A section that reveals once when it scrolls into view. Use with
 * `whileInView="animate"` and `viewport={{ once: true, amount: 0.3 }}`
 * instead of `animate`, so it does not replay on every scroll pass.
 */
export const revealOnScroll = reduceMotion
  ? flat
  : {
      initial: { opacity: 0, y: 28 },
      animate: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
    };

/** Staggers `revealOnScroll` children — same whileInView usage as its child. */
export const revealStagger = reduceMotion
  ? flat
  : {
      initial: {},
      animate: { transition: { staggerChildren: 0.16 } },
    };

/** A vertical line that draws downward as its container scrolls into view. */
export const growLine = reduceMotion
  ? flat
  : {
      initial: { scaleY: 0 },
      animate: { scaleY: 1, transition: { duration: 0.9, ease: EASE } },
    };

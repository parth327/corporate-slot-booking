import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import { pageVariants } from '../lib/motion.js';
import Button from '../components/ui/Button.jsx';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · GatePass';
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
        <Compass size={28} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium uppercase tracking-wide text-brand-600">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
        We could not find that page
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        The link may be out of date, or the page may have moved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button as={Link} to="/">
          Request a visit
        </Button>
        <Button as={Link} to="/login" variant="secondary">
          Staff sign in
        </Button>
      </div>
    </motion.div>
  );
}

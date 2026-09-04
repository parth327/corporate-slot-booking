import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { pageVariants } from '../../lib/motion.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';

/**
 * Where the QR code itself points (server/src/utils/qr.js `scanUrl`) — not a
 * check-in flow. A visitor's own camera app landing here on curiosity, or
 * anyone else who scans the pass, gets an explanation and nothing else: no
 * gatepass data is fetched or shown, and this page can never check anyone
 * in. Actual check-in only happens through the guard's authenticated scanner
 * (client/src/pages/guard/GuardScan.jsx), which extracts the token from this
 * same URL rather than following it.
 */
export default function ScanRestricted() {
  useEffect(() => {
    document.title = 'Security scan only · GatePass';
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-md"
    >
      <Card accent>
        <CardBody className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldCheck size={28} aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink-900">
            Only a security guard can scan this
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-600">
            This QR code checks you in for your meeting only when it's scanned at the security
            desk. Scanning it yourself doesn't do anything on its own.
          </p>

          <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-ink-50 px-4 py-3.5 text-left text-sm text-ink-600">
            <Smartphone size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <p>
              Please show this same QR code — on your phone or printed — to the guard when you
              arrive. They'll scan it and check you in.
            </p>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

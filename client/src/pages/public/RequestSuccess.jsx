import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Mail, CalendarDays, Clock, UserRound, Hash } from 'lucide-react';
import { pageVariants, scaleIn } from '../../lib/motion.js';
import { formatDate, formatRange, formatWeekday } from '../../lib/format.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{label}</p>
        <p className="text-sm font-medium text-ink-800">{value}</p>
      </div>
    </div>
  );
}

export default function RequestSuccess() {
  const { state } = useLocation();
  const result = state?.result;

  useEffect(() => {
    document.title = 'Request sent · GatePass';
  }, []);

  // A direct visit has no router state to render.
  if (!result) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <EmptyState
            icon={Mail}
            title="Nothing to show here"
            description="This page confirms a request right after you send it. Start a new request to continue."
            action={
              <Button as={Link} to="/">
                Request a visit
              </Button>
            }
          />
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-xl"
    >
      <div className="mb-6 text-center">
        <motion.span
          variants={scaleIn}
          initial="initial"
          animate="animate"
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success"
        >
          <CheckCircle2 size={32} aria-hidden="true" />
        </motion.span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Request sent</h1>
        <p className="mt-2 text-sm text-ink-500">
          {result.message || `Your request has been sent to ${result.authority_name}.`}
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="divide-y divide-ink-100">
            <Row icon={Hash} label="Reference" value={`#${result.id}`} />
            <Row icon={UserRound} label="Visitor" value={result.visitor_name} />
            <Row icon={UserRound} label="Host" value={result.authority_name} />
            <Row
              icon={CalendarDays}
              label="Date"
              value={`${formatWeekday(result.requested_date)}, ${formatDate(result.requested_date)}`}
            />
            <Row icon={Clock} label="Time" value={formatRange(result.start_time, result.end_time)} />
          </div>
        </CardBody>
      </Card>

      <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-start gap-3">
          <Mail size={18} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="text-sm text-ink-700">
            <p className="font-medium text-ink-900">Watch your inbox</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">
              Once your host approves the request, you will receive a gatepass with a QR code, the
              room and floor, and a calendar invite. Show the QR code at the security desk when you
              arrive.
            </p>
          </div>
        </div>

        {/* An illustrative mock-up, not the visitor's real pass — theirs does not
            exist until the host approves. Clearly captioned so it can't be
            mistaken for the actual gatepass they're waiting on. */}
        <motion.figure
          initial={{ opacity: 0, y: 10, rotate: -2 }}
          animate={{ opacity: 1, y: 0, rotate: -2 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mx-auto w-40 shrink-0 sm:mx-0"
        >
          <img
            src="/images/4.jpeg"
            alt="A sample GatePass visitor badge with a photo and scannable QR code"
            className="w-full rounded-xl border-4 border-white object-cover shadow-pop"
          />
          <figcaption className="mt-1.5 text-center text-[11px] text-ink-400">
            Example gatepass
          </figcaption>
        </motion.figure>
      </div>

      <div className="mt-6 text-center">
        <Button as={Link} to="/" variant="secondary">
          Submit another request
        </Button>
      </div>
    </motion.div>
  );
}

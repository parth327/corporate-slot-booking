import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, LinkIcon, MessageSquareQuote, Send } from 'lucide-react';
import { publicApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants, scaleIn } from '../../lib/motion.js';
import { formatDate, formatRange, todayISO, minutesBetween } from '../../lib/format.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import TimeRangePicker from '../../components/ui/TimeRangePicker.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

export default function Reschedule() {
  const { token } = useParams();
  const toast = useToast();

  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [form, setForm] = useState({ requested_date: '', start_time: '', end_time: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    document.title = 'Reschedule your visit · GatePass';
  }, []);

  useEffect(() => {
    let cancelled = false;
    publicApi
      .getReschedule(token)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ready', data, error: '' });
        setForm({
          requested_date: data.gatepass.requested_date,
          start_time: data.gatepass.start_time,
          end_time: data.gatepass.end_time,
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.requested_date) next.requested_date = 'Pick a date.';
    else if (form.requested_date < todayISO()) next.requested_date = 'Pick today or a future date.';

    if (!form.start_time || !form.end_time) next.time = 'Choose a start and end time.';
    else {
      const mins = minutesBetween(form.start_time, form.end_time);
      if (mins <= 0) next.time = 'The end time must be after the start time.';
      else if (mins < 15) next.time = 'A meeting must run for at least 15 minutes.';
      else if (mins > 480) next.time = 'A meeting cannot run longer than 8 hours.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      const result = await publicApi.submitReschedule(token, form);
      setDone(result.gatepass);
    } catch (err) {
      if (err.details?.fields) setErrors(err.details.fields);
      else toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-xl">
        <Skeleton className="mb-4 h-8 w-2/3" />
        <Card>
          <CardBody className="space-y-4">
            <SkeletonText lines={3} />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        </Card>
      </motion.div>
    );
  }

  if (state.status === 'error') {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-xl">
        <Card>
          <EmptyState
            icon={LinkIcon}
            title="This link is no longer active"
            description={
              state.error ||
              'The reschedule link has already been used, or the request has moved on. Please contact your host, or send a new request.'
            }
            action={
              <Button as={Link} to="/">
                Send a new request
              </Button>
            }
          />
        </Card>
      </motion.div>
    );
  }

  if (done) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <motion.span
            variants={scaleIn}
            initial="initial"
            animate="animate"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success"
          >
            <CheckCircle2 size={32} aria-hidden="true" />
          </motion.span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">New time proposed</h1>
          <p className="mt-2 text-sm text-ink-500">
            Your host has been notified and will confirm shortly.
          </p>
        </div>
        <Card>
          <CardBody className="text-center">
            <p className="text-xs uppercase tracking-wide text-ink-400">Your new slot</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{formatDate(done.requested_date)}</p>
            <p className="text-sm text-ink-600">{formatRange(done.start_time, done.end_time)}</p>
          </CardBody>
        </Card>
      </motion.div>
    );
  }

  const { gatepass, authority_comment: comment } = state.data;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <CalendarClock size={26} aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Choose a new time</h1>
        <p className="mt-2 text-sm text-ink-500">
          {gatepass.authority_name} has asked whether another slot would work for your visit.
        </p>
      </div>

      <Card>
        <CardBody className="space-y-6">
          <div className="rounded-xl bg-ink-50 px-4 py-3.5">
            <p className="text-xs uppercase tracking-wide text-ink-400">Originally requested</p>
            <p className="mt-1 text-sm font-medium text-ink-800">
              {formatDate(gatepass.requested_date)} · {formatRange(gatepass.start_time, gatepass.end_time)}
            </p>
            <p className="mt-1.5 text-xs text-ink-500">{gatepass.reason}</p>
          </div>

          {comment && (
            <div className="flex gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3.5">
              <MessageSquareQuote size={16} className="mt-0.5 shrink-0 text-violet-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-violet-900">Note from {gatepass.authority_name}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{comment}</p>
              </div>
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            <DatePicker
              label="New date"
              required
              min={todayISO()}
              value={form.requested_date}
              error={errors.requested_date}
              onChange={(e) => setForm((f) => ({ ...f, requested_date: e.target.value }))}
            />
            <TimeRangePicker
              label="New time"
              required
              startValue={form.start_time}
              endValue={form.end_time}
              error={errors.time}
              onChange={({ start_time, end_time }) => {
                setForm((f) => ({ ...f, start_time, end_time }));
                setErrors((prev) => {
                  const draft = { ...prev };
                  delete draft.time;
                  return draft;
                });
              }}
            />
            <Button type="submit" full size="lg" icon={Send} loading={submitting}>
              Propose this time
            </Button>
          </form>
        </CardBody>
      </Card>
    </motion.div>
  );
}

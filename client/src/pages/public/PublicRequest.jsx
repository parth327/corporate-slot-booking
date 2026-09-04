import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Send, UserRound, Building2, CalendarCheck, MailCheck, ShieldCheck, AlertCircle } from 'lucide-react';
import { publicApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import {
  pageVariants,
  listContainer,
  listItem,
  revealOnScroll,
  revealStagger,
  growLine,
} from '../../lib/motion.js';
import { todayISO, minutesBetween } from '../../lib/format.js';
import useLenis from '../../lib/useLenis.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Select from '../../components/ui/Select.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import TimeRangePicker from '../../components/ui/TimeRangePicker.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Eyebrow from '../../components/ui/Eyebrow.jsx';
import HeroGallery from '../../components/public/HeroGallery.jsx';
import CinematicReveal from '../../components/public/CinematicReveal.jsx';
import CinematicParallax from '../../components/public/CinematicParallax.jsx';
import IntroLoader from '../../components/public/IntroLoader.jsx';

const EMPTY = {
  visitor_name: '',
  visitor_company: '',
  visitor_designation: '',
  visitor_mobile: '',
  visitor_whatsapp: '',
  visitor_email: '',
  authority_id: '',
  reason: '',
  requested_date: '',
  start_time: '',
  end_time: '',
};

const STEPS = [
  { Icon: Send, title: 'Send your request', body: 'Tell us who you are meeting and when.' },
  { Icon: CalendarCheck, title: 'Your host approves', body: 'They confirm the slot and reserve a meeting room.' },
  { Icon: MailCheck, title: 'Your pass arrives', body: 'A QR gatepass and calendar invite land in your inbox.' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the server's rules so problems surface before a round trip. */
function validate(form) {
  const e = {};
  if (!form.visitor_name.trim()) e.visitor_name = 'Please tell us your name.';
  else if (form.visitor_name.trim().length < 2) e.visitor_name = 'That name looks too short.';

  const mobileDigits = form.visitor_mobile.replace(/\D/g, '');
  if (!form.visitor_mobile.trim()) e.visitor_mobile = 'A contact number is required.';
  else if (mobileDigits.length < 7 || mobileDigits.length > 15) e.visitor_mobile = 'Enter a valid phone number.';

  if (form.visitor_whatsapp.trim()) {
    const wa = form.visitor_whatsapp.replace(/\D/g, '');
    if (wa.length < 7 || wa.length > 15) e.visitor_whatsapp = 'Enter a valid WhatsApp number.';
  }

  if (!form.visitor_email.trim()) e.visitor_email = 'We need an email address to send your pass.';
  else if (!EMAIL_RE.test(form.visitor_email.trim())) e.visitor_email = 'That does not look like an email address.';

  if (!form.authority_id) e.authority_id = 'Choose who you are meeting.';

  if (!form.reason.trim()) e.reason = 'Let your host know the purpose of the visit.';
  else if (form.reason.trim().length < 5) e.reason = 'Please add a little more detail.';

  if (!form.requested_date) e.requested_date = 'Pick a date.';
  else if (form.requested_date < todayISO()) e.requested_date = 'Pick today or a future date.';

  if (!form.start_time || !form.end_time) {
    e.time = 'Choose a start and end time.';
  } else {
    const mins = minutesBetween(form.start_time, form.end_time);
    if (mins <= 0) e.time = 'The end time must be after the start time.';
    else if (mins < 15) e.time = 'A meeting must run for at least 15 minutes.';
    else if (mins > 480) e.time = 'A meeting cannot run longer than 8 hours.';
  }
  return e;
}

export default function PublicRequest() {
  const navigate = useNavigate();
  const toast = useToast();
  const formRef = useRef(null);

  // Smooth, inertia-based scroll for this page's cinematic sections below —
  // see lib/useLenis.js for the full mechanics of wiring it into GSAP's
  // frame loop so ScrollTrigger's pin/scrub animations stay in sync with it.
  // Purely a feel upgrade for wheel/touch scrolling; it doesn't touch focus,
  // clicks or typing, so the form further down is unaffected.
  useLenis();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [sameWhatsapp, setSameWhatsapp] = useState(false);
  const [authorities, setAuthorities] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Request a visit · GatePass';
  }, []);

  const loadAuthorities = () => {
    setLoadError('');
    publicApi
      .authorities()
      .then(setAuthorities)
      .catch((err) => {
        setAuthorities([]);
        setLoadError(err.message);
      });
  };

  useEffect(loadAuthorities, []);

  const authorityOptions = useMemo(
    () =>
      (authorities || []).map((a) => ({
        value: String(a.id),
        label: a.department ? `${a.name} — ${a.department}` : a.name,
      })),
    [authorities]
  );

  const set = (field) => (event) => {
    const value = event?.target ? event.target.value : event;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'visitor_mobile' && sameWhatsapp) next.visitor_whatsapp = value;
      return next;
    });
    if (touched[field] || errors[field]) {
      setErrors((prev) => {
        const draft = { ...prev };
        delete draft[field];
        return draft;
      });
    }
  };

  const blur = (field) => () => {
    setTouched((t) => ({ ...t, [field]: true }));
    const all = validate(form);
    setErrors((prev) => (all[field] ? { ...prev, [field]: all[field] } : prev));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));

    if (Object.keys(found).length) {
      const firstKey = Object.keys(found)[0];
      const el = formRef.current?.querySelector(
        firstKey === 'time' ? 'input[type="time"]' : `[name="${firstKey}"]`
      );
      el?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const result = await publicApi.submitRequest({
        ...form,
        authority_id: Number(form.authority_id),
        visitor_company: form.visitor_company.trim() || undefined,
        visitor_designation: form.visitor_designation.trim() || undefined,
        visitor_whatsapp: form.visitor_whatsapp.trim() || undefined,
      });
      navigate('/request/success', { state: { result } });
    } catch (err) {
      if (err.details?.fields) {
        setErrors(err.details.fields);
        toast.error('Please check the highlighted fields.');
      } else {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <IntroLoader />
      <HeroGallery
        fullBleed
        showScrollCue
        headline="Request a visit"
        subtitle="Tell us who you are meeting and when. Your host confirms the slot and books the room — your gatepass follows by email."
      />

      <CinematicReveal
        image="/images/4.jpeg"
        alt="A GatePass visitor badge with photo, company and a scannable QR code"
        eyebrow="Your gate pass"
        heading="Delivered to your inbox before you've even left the lobby."
      />

      <CinematicParallax />

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card accent>
          <CardBody>
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-700 motion-safe:animate-badge-in">
              <ShieldCheck size={13} aria-hidden="true" />
              Quick &amp; secure
            </span>

            {loadError && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p>We could not load the list of hosts. {loadError}</p>
                  <button
                    type="button"
                    onClick={loadAuthorities}
                    className="mt-1 font-medium underline underline-offset-2"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            <motion.form
              ref={formRef}
              onSubmit={submit}
              noValidate
              variants={listContainer}
              initial="initial"
              animate="animate"
              className="space-y-6"
            >
              <motion.fieldset variants={listItem} className="space-y-4">
                <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <UserRound size={16} className="text-brand-500" aria-hidden="true" />
                  About you
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Full name"
                    name="visitor_name"
                    required
                    autoComplete="name"
                    placeholder="Jon Kim"
                    value={form.visitor_name}
                    error={errors.visitor_name}
                    onChange={set('visitor_name')}
                    onBlur={blur('visitor_name')}
                  />
                  <Input
                    label="Company"
                    name="visitor_company"
                    autoComplete="organization"
                    placeholder="Northwind Ltd"
                    value={form.visitor_company}
                    error={errors.visitor_company}
                    onChange={set('visitor_company')}
                  />
                  <Input
                    label="Designation"
                    name="visitor_designation"
                    autoComplete="organization-title"
                    placeholder="Partnerships Lead"
                    value={form.visitor_designation}
                    error={errors.visitor_designation}
                    onChange={set('visitor_designation')}
                  />
                  <Input
                    label="Email address"
                    name="visitor_email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="jon@northwind.com"
                    hint="Your gatepass will be sent here."
                    value={form.visitor_email}
                    error={errors.visitor_email}
                    onChange={set('visitor_email')}
                    onBlur={blur('visitor_email')}
                  />
                  <Input
                    label="Mobile number"
                    name="visitor_mobile"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="+91 98123 45678"
                    value={form.visitor_mobile}
                    error={errors.visitor_mobile}
                    onChange={set('visitor_mobile')}
                    onBlur={blur('visitor_mobile')}
                  />
                  <div>
                    <Input
                      label="WhatsApp number"
                      name="visitor_whatsapp"
                      type="tel"
                      placeholder="+91 98123 45678"
                      disabled={sameWhatsapp}
                      value={form.visitor_whatsapp}
                      error={errors.visitor_whatsapp}
                      onChange={set('visitor_whatsapp')}
                    />
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-500">
                      <input
                        type="checkbox"
                        checked={sameWhatsapp}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setSameWhatsapp(on);
                          setForm((f) => ({ ...f, visitor_whatsapp: on ? f.visitor_mobile : '' }));
                        }}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500"
                      />
                      Same as my mobile number
                    </label>
                  </div>
                </div>
              </motion.fieldset>

              <motion.fieldset variants={listItem} className="space-y-4 border-t border-ink-100 pt-6">
                <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <Building2 size={16} className="text-brand-500" aria-hidden="true" />
                  Your meeting
                </legend>

                {authorities === null ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-ink-400">
                    <Spinner size="sm" /> Loading hosts…
                  </div>
                ) : (
                  <Select
                    label="Who are you meeting?"
                    name="authority_id"
                    required
                    placeholder={authorityOptions.length ? 'Select a host' : 'No hosts available'}
                    options={authorityOptions}
                    value={form.authority_id}
                    error={errors.authority_id}
                    onChange={set('authority_id')}
                    onBlur={blur('authority_id')}
                  />
                )}

                <Textarea
                  label="Purpose of the visit"
                  name="reason"
                  required
                  rows={3}
                  placeholder="Quarterly partnership review"
                  value={form.reason}
                  error={errors.reason}
                  onChange={set('reason')}
                  onBlur={blur('reason')}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <DatePicker
                    label="Date"
                    name="requested_date"
                    required
                    min={todayISO()}
                    value={form.requested_date}
                    error={errors.requested_date}
                    onChange={set('requested_date')}
                    onBlur={blur('requested_date')}
                  />
                  <TimeRangePicker
                    label="Time"
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
                </div>
              </motion.fieldset>

              <motion.div variants={listItem} className="border-t border-ink-100 pt-6">
                <Button
                  type="submit"
                  size="lg"
                  full
                  icon={Send}
                  loading={submitting}
                  disabled={authorities !== null && authorityOptions.length === 0}
                >
                  Send request
                </Button>
                <p className="mt-3 text-center text-xs text-ink-400">
                  You will receive an email as soon as your host responds.
                </p>
              </motion.div>
            </motion.form>
          </CardBody>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardBody>
              <Eyebrow className="mb-1.5">How it works</Eyebrow>
              <h2 className="mb-4 text-base font-semibold text-ink-900">What happens next</h2>
              {/* Each step discloses as it scrolls into view, and the connecting
                  line draws downward alongside it — the same "reveal as you
                  reach it" language a scroll-driven timeline uses, scaled to
                  a short list rather than a full page-height history. */}
              <motion.ol
                variants={revealStagger}
                initial="initial"
                whileInView="animate"
                viewport={{ once: true, amount: 0.4 }}
                className="space-y-4"
              >
                {STEPS.map(({ Icon, title, body }, index) => (
                  <motion.li key={title} variants={revealOnScroll} className="flex gap-3">
                    <span className="relative flex flex-col items-center">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      {index < STEPS.length - 1 && (
                        <motion.span
                          variants={growLine}
                          style={{ transformOrigin: 'top' }}
                          className="mt-1 w-px flex-1 bg-ink-100"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <div className="pb-1">
                      <p className="text-sm font-medium text-ink-800">{title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{body}</p>
                    </div>
                  </motion.li>
                ))}
              </motion.ol>
            </CardBody>
          </Card>

          <motion.div
            variants={revealOnScroll}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.6 }}
            className="flex items-start gap-2.5 rounded-2xl border border-ink-100 bg-white/70 px-4 py-3.5"
          >
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-500">
              Your details are shared only with your host and the security desk, and are used to
              produce your gatepass.
            </p>
          </motion.div>
        </aside>
      </div>
    </motion.div>
  );
}

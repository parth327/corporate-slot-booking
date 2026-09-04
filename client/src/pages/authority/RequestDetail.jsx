import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarDays, Clock, MapPin, MessageSquare, Send, XCircle, CalendarClock,
  Replace, DoorClosed, Mail, AlertCircle, FileText, Hourglass,
  CheckCircle2, LogIn, LogOut, Building2,
} from 'lucide-react';
import cn from '../../lib/cn.js';
import { gatepassApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants } from '../../lib/motion.js';
import {
  formatDate, formatWeekday, formatRange, formatDateTime, minutesBetween,
  durationLabel, initials,
} from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card, { CardBody, CardHeader, CardTitle } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import TimeRangePicker from '../../components/ui/TimeRangePicker.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import Skeleton, { SkeletonText } from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ApproveRoomModal from '../../components/authority/ApproveRoomModal.jsx';
import VisitorContactBar from '../../components/authority/VisitorContactBar.jsx';
import GatepassCard from '../../components/shared/GatepassCard.jsx';

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{label}</p>
        <div className="text-sm text-ink-800">{children}</div>
      </div>
    </div>
  );
}

/** Lifecycle rail built from the timestamps the row already carries. */
function Timeline({ g }) {
  const steps = [
    { key: 'requested', label: 'Requested', at: g.created_at, Icon: FileText },
    { key: 'approved', label: 'Approved', at: g.approved_at, Icon: CheckCircle2 },
    { key: 'in', label: 'Checked in', at: g.check_in_time, Icon: LogIn },
    {
      key: 'out',
      label: g.is_closed_early ? 'Closed early' : 'Checked out',
      at: g.check_out_time || (g.is_closed_early ? g.actual_end : null),
      Icon: LogOut,
    },
  ];

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = Boolean(step.at);
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  done ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-300'
                )}
              >
                <step.Icon size={15} aria-hidden="true" />
              </span>
              {!last && (
                <span className={cn('my-1 w-px flex-1', done ? 'bg-brand-100' : 'bg-ink-100')} aria-hidden="true" />
              )}
            </div>
            <div className={cn('pb-5', last && 'pb-0')}>
              <p className={cn('text-sm', done ? 'font-medium text-ink-800' : 'text-ink-400')}>{step.label}</p>
              <p className="text-xs text-ink-400">{done ? formatDateTime(step.at) : 'Pending'}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [roomModal, setRoomModal] = useState(null); // 'approve' | 'switch' | null
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [rejectComment, setRejectComment] = useState('');
  const [reschedule, setReschedule] = useState({ comment: '', suggested_date: '', suggested_start: '', suggested_end: '' });
  const [comment, setComment] = useState('');
  const [fieldError, setFieldError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setG(await gatepassApi.get(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.title = g ? `${g.visitor_name} · GatePass` : 'Request · GatePass';
  }, [g]);

  /** Runs an action, replaces local state from the response and reports failure. */
  const run = async (fn, successMessage) => {
    setBusy(true);
    try {
      const updated = await fn();
      if (updated && updated.id) setG(updated);
      else await load();
      if (successMessage) toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err.message);
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="We could not load this request"
            description={error}
            action={
              <div className="flex gap-2">
                <Button onClick={load}>Try again</Button>
                <Button variant="secondary" onClick={() => navigate('/authority')}>
                  Back to requests
                </Button>
              </div>
            }
          />
        </Card>
      </motion.div>
    );
  }

  if (!g) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <Skeleton className="mb-5 h-9 w-64" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardBody className="space-y-4">
              <SkeletonText lines={5} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <SkeletonText lines={4} />
            </CardBody>
          </Card>
        </div>
      </motion.div>
    );
  }

  const status = g.display_status;
  const isOpen = status === 'PENDING' || status === 'RESCHEDULE_REQUESTED';
  const isApproved = status === 'APPROVED';
  const isCheckedIn = status === 'CHECKED_IN';
  const isFinal = status === 'COMPLETED' || status === 'REJECTED' || status === 'CANCELLED';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader
        breadcrumb={{ to: '/authority', label: 'All requests' }}
        title={g.visitor_name}
        description={[g.visitor_designation, g.visitor_company].filter(Boolean).join(' · ') || 'Visitor'}
        actions={<StatusBadge status={status} size="md" />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Meeting details</CardTitle>
            </CardHeader>
            <CardBody className="pt-0">
              <div className="divide-y divide-ink-100">
                <DetailRow icon={FileText} label="Purpose">
                  <p className="whitespace-pre-line">{g.reason}</p>
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Date">
                  {formatWeekday(g.requested_date)}, {formatDate(g.requested_date)}
                </DetailRow>
                <DetailRow icon={Clock} label="Time">
                  {formatRange(g.start_time, g.end_time)}
                  <span className="ml-2 text-ink-400">
                    ({durationLabel(minutesBetween(g.start_time, g.end_time))})
                  </span>
                </DetailRow>
                <DetailRow icon={MapPin} label="Room">
                  {g.room_name ? (
                    <>
                      <span className="font-medium">{g.room_name}</span>
                      <span className="text-ink-500">
                        {' '}
                        · {[g.room_building, g.room_floor && `Floor ${g.room_floor}`].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-400">Not assigned yet</span>
                  )}
                </DetailRow>
                <DetailRow icon={Mail} label="Submitted">
                  {formatDateTime(g.created_at)}
                </DetailRow>
                {g.authority_comment && (
                  <DetailRow icon={MessageSquare} label="Your notes">
                    <p className="whitespace-pre-line">{g.authority_comment}</p>
                  </DetailRow>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardBody>
              <Timeline g={g} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody className="space-y-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                  aria-hidden="true"
                >
                  {initials(g.visitor_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900">{g.visitor_name}</p>
                  <p className="truncate text-xs text-ink-500">{g.visitor_email}</p>
                </div>
              </div>
              <VisitorContactBar gatepass={g} />
            </CardBody>
          </Card>

          {(isApproved || isCheckedIn) && g.qr_short_code && (
            <div>
              <GatepassCard gatepass={g} />
              <p className="mt-2 text-center text-xs leading-relaxed text-ink-400">
                The visitor received this same pass by email — this is the fallback if their camera
                will not read it.
              </p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {isOpen && (
                <>
                  <Button full icon={CheckCircle2} disabled={busy} onClick={() => setRoomModal('approve')}>
                    Approve &amp; book a room
                  </Button>
                  <Button
                    full
                    variant="secondary"
                    icon={CalendarClock}
                    disabled={busy}
                    onClick={() => {
                      setReschedule({
                        comment: '',
                        suggested_date: g.requested_date,
                        suggested_start: g.start_time,
                        suggested_end: g.end_time,
                      });
                      setFieldError('');
                      setRescheduleOpen(true);
                    }}
                  >
                    Request a different time
                  </Button>
                  <Button
                    full
                    variant="ghost"
                    icon={XCircle}
                    disabled={busy}
                    onClick={() => {
                      setRejectComment('');
                      setFieldError('');
                      setRejectOpen(true);
                    }}
                    className="text-danger hover:bg-red-50"
                  >
                    Reject request
                  </Button>
                </>
              )}

              {isApproved && (
                <>
                  <Button full variant="secondary" icon={Replace} disabled={busy} onClick={() => setRoomModal('switch')}>
                    Move to another room
                  </Button>
                  <Button
                    full
                    variant="secondary"
                    icon={Send}
                    disabled={busy}
                    onClick={() => run(() => gatepassApi.resendEmail(g.id), 'Gatepass email re-sent.')}
                  >
                    Re-send gatepass email
                  </Button>
                  <Button full variant="ghost" icon={DoorClosed} disabled={busy} onClick={() => setCloseOpen(true)}>
                    Close meeting early
                  </Button>
                </>
              )}

              {isCheckedIn && (
                <>
                  <div className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">
                    <p className="font-medium">Visitor is on premises</p>
                    <p className="mt-0.5 text-xs">Checked in at {formatDateTime(g.check_in_time)}</p>
                  </div>
                  <Button full variant="secondary" icon={DoorClosed} disabled={busy} onClick={() => setCloseOpen(true)}>
                    Close meeting early
                  </Button>
                </>
              )}

              {isFinal && (
                <div className="flex items-start gap-2.5 rounded-xl bg-ink-50 px-3.5 py-3 text-sm text-ink-600">
                  <Hourglass size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
                  <p>
                    This request is {status.toLowerCase()} and can no longer be actioned.
                    {g.actual_end && ` Meeting ended ${formatDateTime(g.actual_end)}.`}
                  </p>
                </div>
              )}

              <Button
                full
                variant="ghost"
                icon={MessageSquare}
                disabled={busy}
                onClick={() => {
                  setComment('');
                  setFieldError('');
                  setCommentOpen(true);
                }}
              >
                Add a note
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Host</p>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-800">
                <Building2 size={14} className="text-ink-400" aria-hidden="true" />
                {g.authority_name}
                {g.authority_department && <span className="text-ink-400">· {g.authority_department}</span>}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <ApproveRoomModal
        open={roomModal !== null}
        mode={roomModal || 'approve'}
        gatepass={g}
        onClose={() => setRoomModal(null)}
        onDone={setG}
      />

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject this request"
        description="Your note is emailed to the visitor, so they know why."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (rejectComment.trim().length < 3) {
                  setFieldError('Please give the visitor a short reason.');
                  return;
                }
                const ok = await run(
                  () => gatepassApi.reject(g.id, { comment: rejectComment.trim() }),
                  'Request rejected and the visitor notified.'
                );
                if (ok) setRejectOpen(false);
              }}
            >
              Reject request
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          required
          rows={3}
          autoFocus
          placeholder="Unfortunately I am travelling that week."
          value={rejectComment}
          error={fieldError}
          onChange={(e) => {
            setRejectComment(e.target.value);
            setFieldError('');
          }}
        />
      </Modal>

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Ask for a different time"
        description="The visitor gets a link to propose a new slot."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (reschedule.comment.trim().length < 3) {
                  setFieldError('Please add a short note for the visitor.');
                  return;
                }
                const ok = await run(
                  () =>
                    gatepassApi.reschedule(g.id, {
                      comment: reschedule.comment.trim(),
                      ...(reschedule.suggested_date ? { suggested_date: reschedule.suggested_date } : {}),
                      ...(reschedule.suggested_start ? { suggested_start: reschedule.suggested_start } : {}),
                      ...(reschedule.suggested_end ? { suggested_end: reschedule.suggested_end } : {}),
                    }),
                  'Reschedule link sent to the visitor.'
                );
                if (ok) setRescheduleOpen(false);
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Message to the visitor"
            required
            rows={3}
            autoFocus
            placeholder="Could we move this to the afternoon?"
            value={reschedule.comment}
            error={fieldError}
            onChange={(e) => {
              setReschedule((r) => ({ ...r, comment: e.target.value }));
              setFieldError('');
            }}
          />
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
            Suggest a slot (optional)
          </p>
          <DatePicker
            label="Date"
            value={reschedule.suggested_date}
            onChange={(e) => setReschedule((r) => ({ ...r, suggested_date: e.target.value }))}
          />
          <TimeRangePicker
            label="Time"
            startValue={reschedule.suggested_start}
            endValue={reschedule.suggested_end}
            onChange={({ start_time, end_time }) =>
              setReschedule((r) => ({ ...r, suggested_start: start_time, suggested_end: end_time }))
            }
          />
        </div>
      </Modal>

      <Modal
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
        title="Add a note"
        description="Kept on the request for your own reference. No email is sent."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCommentOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                if (!comment.trim()) {
                  setFieldError('Write something first.');
                  return;
                }
                const ok = await run(() => gatepassApi.comment(g.id, { comment: comment.trim() }), 'Note added.');
                if (ok) setCommentOpen(false);
              }}
            >
              Save note
            </Button>
          </>
        }
      >
        <Textarea
          label="Note"
          rows={3}
          autoFocus
          value={comment}
          error={fieldError}
          onChange={(e) => {
            setComment(e.target.value);
            setFieldError('');
          }}
        />
      </Modal>

      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onConfirm={async () => {
          const ok = await run(() => gatepassApi.closeEarly(g.id), 'Meeting closed — the room is free again.');
          if (ok) setCloseOpen(false);
        }}
        title="Close this meeting early?"
        description={`${g.room_name || 'The room'} becomes available for other bookings straight away. This cannot be undone.`}
        confirmLabel="Close meeting"
        tone="warning"
        loading={busy}
      />
    </motion.div>
  );
}

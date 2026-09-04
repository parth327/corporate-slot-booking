import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Phone, ScanLine, AlertCircle, CheckCheck } from 'lucide-react';
import { securityApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants } from '../../lib/motion.js';
import { formatDateTime, elapsedSince, durationLabel, telHref } from '../../lib/format.js';
import VisitorPassCard from '../../components/guard/VisitorPassCard.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

export default function GuardVisitor() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  // A scan hands us the verified pass, so the screen paints with no round trip.
  const seeded = state?.verification;
  const [gatepass, setGatepass] = useState(seeded?.gatepass ?? null);
  const [checks, setChecks] = useState(seeded?.checks ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'in' | 'out' | null
  const [, forceTick] = useState(0);

  const load = useCallback(async () => {
    setError('');
    try {
      setGatepass(await securityApi.get(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  // Always refresh in the background, even when seeded.
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    document.title = gatepass ? `${gatepass.visitor_name} · GatePass` : 'Visitor · GatePass';
  }, [gatepass]);

  // Keep the on-premises timer honest.
  const onSite = gatepass?.check_in_time && !gatepass?.check_out_time;
  useEffect(() => {
    if (!onSite) return undefined;
    const timer = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, [onSite]);

  const act = async (kind) => {
    setBusy(true);
    try {
      const updated = kind === 'in' ? await securityApi.checkIn(id) : await securityApi.checkOut(id);
      setGatepass(updated);
      setChecks(null);
      toast.success(kind === 'in' ? 'Visitor checked in.' : 'Visitor checked out.');
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
      await load(); // the server knows better; resync
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (error && !gatepass) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-md">
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="Could not load this pass"
            description={error}
            action={
              <div className="flex gap-2">
                <Button onClick={load}>Try again</Button>
                <Button as={Link} to="/guard" variant="secondary">
                  Back to scanner
                </Button>
              </div>
            }
          />
        </Card>
      </motion.div>
    );
  }

  if (!gatepass) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-24 w-full" rounded="rounded-2xl" />
        <Skeleton className="h-64 w-full" rounded="rounded-2xl" />
      </motion.div>
    );
  }

  const checkedIn = Boolean(gatepass.check_in_time);
  const checkedOut = Boolean(gatepass.check_out_time);
  const hostTel = telHref(gatepass.authority_mobile);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-md space-y-4 pb-32"
    >
      <VisitorPassCard gatepass={gatepass} checks={checks} />

      {hostTel && (
        <Button as="a" href={hostTel} full variant="secondary" size="lg" icon={Phone}>
          Call {gatepass.authority_name}
        </Button>
      )}

      {checkedOut && (
        <Card>
          <CardBody className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Checked in</span>
              <span className="font-medium text-ink-800">{formatDateTime(gatepass.check_in_time)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Checked out</span>
              <span className="font-medium text-ink-800">{formatDateTime(gatepass.check_out_time)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 pt-2">
              <span className="text-ink-500">Time on site</span>
              <span className="font-medium text-ink-800">
                {durationLabel(
                  Math.round(
                    (new Date(gatepass.check_out_time) - new Date(gatepass.check_in_time)) / 60000
                  )
                )}
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Sticky action bar — the one thing a guard taps, always in reach. */}
      <div className="pb-safe fixed inset-x-0 bottom-14 z-30 border-t border-ink-100 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0">
        <div className="mx-auto max-w-md">
          {!checkedIn && (
            <Button full size="lg" variant="success" icon={LogIn} className="h-14 text-base" onClick={() => setConfirm('in')}>
              Check in
            </Button>
          )}

          {checkedIn && !checkedOut && (
            <>
              <p className="mb-2 text-center text-xs text-ink-500">
                On premises for <span className="font-medium text-ink-700">{elapsedSince(gatepass.check_in_time)}</span>
              </p>
              <Button full size="lg" icon={LogOut} className="h-14 text-base" onClick={() => setConfirm('out')}>
                Check out
              </Button>
            </>
          )}

          {checkedOut && (
            <div className="space-y-2">
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-ink-500">
                <CheckCheck size={16} className="text-success" aria-hidden="true" />
                Visit complete
              </p>
              <Button
                full
                size="lg"
                variant="secondary"
                icon={ScanLine}
                onClick={() => navigate('/guard')}
              >
                Scan next visitor
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'in'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act('in')}
        title={`Check in ${gatepass.visitor_name}?`}
        description={`Their arrival time will be recorded and ${gatepass.authority_name} can see they are on site.`}
        confirmLabel="Check in"
        tone="success"
        loading={busy}
      />

      <ConfirmDialog
        open={confirm === 'out'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act('out')}
        title={`Check out ${gatepass.visitor_name}?`}
        description="Their departure time will be recorded and the meeting marked complete."
        confirmLabel="Check out"
        tone="brand"
        loading={busy}
      />
    </motion.div>
  );
}

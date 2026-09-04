import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ScanLine, Search, XCircle, ChevronDown, ChevronUp, Users, LogIn, LogOut, RotateCcw,
  Phone, MessageCircle, ScanEye, History,
} from 'lucide-react';
import cn from '../../lib/cn.js';
import { securityApi } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { pageVariants } from '../../lib/motion.js';
import { formatRange, formatDate, formatWeekday, telHref, waHref } from '../../lib/format.js';
import QrScanner from '../../components/guard/QrScanner.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

function MiniStat({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-3 py-2.5 text-center">
      <Icon size={16} className={cn('mx-auto mb-1', tone)} aria-hidden="true" />
      <p className="text-lg font-semibold leading-none tabular-nums text-ink-900">{value ?? '—'}</p>
      <p className="mt-1 text-[11px] text-ink-400">{label}</p>
    </div>
  );
}

/** Small tap-target for reaching the host directly, without opening the visitor page. */
function AuthorityContactButtons({ mobile, name, className }) {
  const tel = telHref(mobile);
  const wa = waHref(mobile, `Hi ${name || ''}, this is security regarding a visitor arriving today`.trim());
  if (!tel && !wa) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <span className={cn('flex shrink-0 items-center gap-1', className)}>
      {tel && (
        <a
          href={tel}
          onClick={stop}
          aria-label={`Call ${name || 'the approval authority'}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Phone size={14} aria-hidden="true" />
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          aria-label={`WhatsApp ${name || 'the approval authority'}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <MessageCircle size={14} aria-hidden="true" />
        </a>
      )}
    </span>
  );
}

export default function GuardScan() {
  const navigate = useNavigate();
  const toast = useToast();

  const [scanning, setScanning] = useState(false);
  const [failure, setFailure] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [today, setToday] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    document.title = 'Scan gatepass · GatePass';
  }, []);

  const loadToday = useCallback(() => {
    securityApi
      .today()
      .then(setToday)
      .catch(() => setToday({ expected: [], on_premises: [], departed: [], stats: {} }));
  }, []);

  useEffect(loadToday, [loadToday]);

  const loadHistory = useCallback(() => {
    securityApi
      .history({ days: 14 })
      .then((data) => setHistory(data.items || []))
      .catch(() => setHistory([]));
  }, []);

  useEffect(loadHistory, [loadHistory]);

  const scannedToday = (today?.stats?.on_premises ?? 0) + (today?.stats?.departed ?? 0);

  const go = (result) => {
    navigate(`/guard/visitor/${result.gatepass.id}`, { state: { verification: result } });
  };

  const verify = useCallback(
    async (payload) => {
      setVerifying(true);
      setFailure('');
      try {
        go(await securityApi.verify(payload));
      } catch (err) {
        setFailure(err.message);
        setScanning(false);
      } finally {
        setVerifying(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onDecoded = useCallback(
    (text) => {
      setScanning(false);
      verify({ token: text });
    },
    [verify]
  );

  const rescan = () => {
    setFailure('');
    setCode('');
    setScanning(true);
  };

  const submitCode = (event) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) {
      setFailure('Enter the full 8-character code from the visitor’s pass.');
      return;
    }
    verify({ short_code: trimmed });
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-md space-y-4"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Scan gatepass</h1>
        <p className="mt-0.5 text-sm text-ink-500">Point the camera at the visitor’s QR code.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Expected" value={today?.stats?.expected} icon={Users} tone="text-brand-500" />
        <MiniStat label="On site" value={today?.stats?.on_premises} icon={LogIn} tone="text-success" />
        <MiniStat label="Departed" value={today?.stats?.departed} icon={LogOut} tone="text-ink-400" />
        <MiniStat label="Scanned" value={today ? scannedToday : null} icon={ScanEye} tone="text-brand-600" />
      </div>

      {failure ? (
        <Card className="border-red-200">
          <CardBody className="text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-danger">
              <XCircle size={28} aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-ink-900">Not accepted</h2>
            <p className="mt-1.5 text-sm text-ink-600">{failure}</p>
            <Button full size="lg" icon={RotateCcw} className="mt-5" onClick={rescan}>
              Scan again
            </Button>
          </CardBody>
        </Card>
      ) : (
        <QrScanner
          active={scanning && !verifying}
          onToggle={() => setScanning((v) => !v)}
          onResult={onDecoded}
          onError={setFailure}
        />
      )}

      <Card>
        <CardBody>
          <form onSubmit={submitCode} className="space-y-3">
            <Input
              label="Or enter the 8-character code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
              maxLength={8}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="A1B2C3D4"
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
            <Button type="submit" full size="lg" variant="secondary" icon={ScanLine} loading={verifying}>
              Verify code
            </Button>
          </form>
          <Button as={Link} to="/guard/search" full variant="ghost" icon={Search} className="mt-2">
            Search by name or number
          </Button>
        </CardBody>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="text-sm font-medium text-ink-900">
            Expected today
            {today?.expected?.length ? (
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                {today.expected.length}
              </span>
            ) : null}
          </span>
          {listOpen ? (
            <ChevronUp size={18} className="text-ink-400" aria-hidden="true" />
          ) : (
            <ChevronDown size={18} className="text-ink-400" aria-hidden="true" />
          )}
        </button>

        {listOpen && (
          <div className="border-t border-ink-100">
            {today === null ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" rounded="rounded-xl" />
                ))}
              </div>
            ) : today.expected.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody else expected"
                description="Every approved visitor for today has already arrived."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {today.expected.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={`/guard/visitor/${g.id}`}
                      className="flex min-h-[3.5rem] items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-ink-50 focus-visible:outline-none focus-visible:bg-ink-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-800">{g.visitor_name}</span>
                        <span className="block truncate text-xs text-ink-400">
                          {formatRange(g.start_time, g.end_time)}
                          {g.room_name && ` · ${g.room_name}`}
                          {g.authority_name && ` · to see ${g.authority_name}`}
                        </span>
                      </span>
                      <AuthorityContactButtons mobile={g.authority_mobile} name={g.authority_name} />
                      <StatusBadge status={g.display_status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="text-sm font-medium text-ink-900">Scan history</span>
          {historyOpen ? (
            <ChevronUp size={18} className="text-ink-400" aria-hidden="true" />
          ) : (
            <ChevronDown size={18} className="text-ink-400" aria-hidden="true" />
          )}
        </button>

        {historyOpen && (
          <div className="border-t border-ink-100">
            {history === null ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" rounded="rounded-xl" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={History}
                title="No scans yet"
                description="Once visitors start checking in, each day's totals show up here."
                className="py-8"
              />
            ) : (
              <>
                <div className="flex items-center gap-3 px-5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  <span className="flex-1">Date</span>
                  <span className="w-14 text-right">Scanned</span>
                  <span className="w-14 text-right">Departed</span>
                </div>
                <ul className="divide-y divide-ink-100">
                  {history.map((row) => (
                    <li key={row.date} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-800">{formatDate(row.date)}</span>
                        <span className="block text-xs text-ink-400">{formatWeekday(row.date)}</span>
                      </span>
                      <span className="w-14 text-right tabular-nums text-ink-700">{row.scanned}</span>
                      <span className="w-14 text-right tabular-nums text-ink-400">{row.departed}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

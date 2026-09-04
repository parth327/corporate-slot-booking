import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, UserSearch, AlertCircle, MapPin, ChevronRight, ScanLine } from 'lucide-react';
import { securityApi } from '../../lib/api.js';
import { pageVariants, listContainer, listItem } from '../../lib/motion.js';
import { formatDate, formatRange, initials } from '../../lib/format.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

export default function GuardSearch() {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const [state, setState] = useState({ status: 'idle', items: [], error: '' });
  // Guards against an earlier, slower response overwriting a later one.
  const seq = useRef(0);

  useEffect(() => {
    document.title = 'Find a visitor · GatePass';
  }, []);

  useEffect(() => {
    const term = debounced.trim();
    if (term.length < 2) {
      setState({ status: 'idle', items: [], error: '' });
      return;
    }
    const id = ++seq.current;
    setState((s) => ({ ...s, status: 'loading' }));
    securityApi
      .search(term)
      .then((data) => {
        if (id !== seq.current) return;
        setState({ status: 'ready', items: data.items || [], error: '' });
      })
      .catch((err) => {
        if (id !== seq.current) return;
        setState({ status: 'error', items: [], error: err.message });
      });
  }, [debounced]);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mx-auto max-w-md space-y-4"
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Find a visitor</h1>
        <p className="mt-0.5 text-sm text-ink-500">Search approved passes for yesterday, today and tomorrow.</p>
      </div>

      <Input
        icon={Search}
        type="search"
        inputMode="search"
        autoFocus
        autoComplete="off"
        placeholder="Visitor name or mobile number"
        aria-label="Search visitors"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-12 text-base"
      />

      {state.status === 'idle' && (
        <Card>
          <EmptyState
            icon={UserSearch}
            title="Start typing to search"
            description="Enter at least two characters of the visitor's name, or part of their mobile number."
            action={
              <Button as={Link} to="/guard" variant="secondary" icon={ScanLine}>
                Scan a QR code instead
              </Button>
            }
          />
        </Card>
      )}

      {state.status === 'loading' && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" rounded="rounded-2xl" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <Card className="border-red-200 bg-red-50">
          <CardBody className="flex items-start gap-2.5 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{state.error}</span>
          </CardBody>
        </Card>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <Card>
          <EmptyState
            icon={UserSearch}
            title="No matching visitor"
            description="Only approved passes within a day of today appear here. Check the spelling, or ask the visitor for their gatepass code."
          />
        </Card>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <motion.ul variants={listContainer} initial="initial" animate="animate" className="space-y-2">
          {state.items.map((g) => (
            <motion.li key={g.id} variants={listItem}>
              <Link
                to={`/guard/visitor/${g.id}`}
                className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition-colors hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700"
                  aria-hidden="true"
                >
                  {initials(g.visitor_name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-base font-medium text-ink-900">{g.visitor_name}</span>
                    <StatusBadge status={g.display_status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-500">
                    {g.visitor_company || 'Visitor'} · {formatDate(g.requested_date)} ·{' '}
                    {formatRange(g.start_time, g.end_time)}
                  </span>
                  <span className="mt-1 flex items-center gap-1 truncate text-xs text-ink-500">
                    <MapPin size={12} className="shrink-0 text-ink-400" aria-hidden="true" />
                    {g.room_name
                      ? [g.room_name, g.room_floor && `Floor ${g.room_floor}`].filter(Boolean).join(' · ')
                      : 'No room'}
                    <span className="text-ink-300">·</span>
                    {g.authority_name}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-300" aria-hidden="true" />
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </motion.div>
  );
}

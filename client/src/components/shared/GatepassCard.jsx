import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, MapPin, CalendarDays, Clock, UserRound, Copy, Check } from 'lucide-react';
import cn from '../../lib/cn.js';
import { qrImageUrl } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { scaleIn, reduceMotion } from '../../lib/motion.js';
import { formatDate, formatWeekday, formatRange, initials } from '../../lib/format.js';
import { statusMeta } from '../../lib/status.js';

/**
 * The visitor's actual gate pass, rendered as a physical-badge-style card —
 * not just a bare QR floating in a box. Same component powers the authority
 * and admin dashboard views; the HTML email uses its own hand-built table
 * markup (server/src/services/templates.js) since mail clients cannot run
 * React, but is styled to match this as closely as inline-CSS email allows.
 *
 * Only renders the live QR once one exists (`qr_short_code` + `qr_code_hash`
 * both present) — a pending/rejected request has neither.
 */
export default function GatepassCard({ gatepass: g, className }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const qrSrc = qrImageUrl(g.id, g.qr_code_hash);
  const { label: statusLabel, Icon: StatusIcon } = statusMeta(g.display_status);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(g.qr_short_code);
      setCopied(true);
      toast.success('Gatepass code copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please select the code manually.');
    }
  };

  return (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      className={cn(
        'relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-pop',
        className
      )}
    >
      {/* Header — brand gradient, wordmark, status. */}
      <div className="relative bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 px-5 pb-7 pt-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <ShieldCheck size={17} aria-hidden="true" />
            GatePass
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/25">
            <StatusIcon size={12} className="shrink-0" aria-hidden="true" />
            {statusLabel}
          </span>
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Visitor pass</p>
      </div>

      {/* The badge "hole" punch — the one detail that reads as a physical card rather than a web card. */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[3.9rem] h-5 w-5 -translate-x-1/2 rounded-full bg-ink-50 ring-4 ring-white"
      />

      <div className="-mt-4 rounded-t-3xl bg-white px-5 pb-6 pt-6">
        {/* Visitor identity */}
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-inset ring-brand-100"
            aria-hidden="true"
          >
            {initials(g.visitor_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-ink-900">{g.visitor_name}</p>
            <p className="truncate text-xs text-ink-500">
              {[g.visitor_designation, g.visitor_company].filter(Boolean).join(' · ') || 'Visitor'}
            </p>
          </div>
        </div>

        {/* QR — the actual credential. */}
        {qrSrc ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl border-2 border-dashed border-brand-100 bg-brand-50/40 px-4 py-5">
            <div className="relative overflow-hidden rounded-xl bg-white p-2 shadow-sm">
              <img src={qrSrc} alt="Gatepass QR code" width={168} height={168} className="block h-[168px] w-[168px]" />
              {!reduceMotion && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/80 to-transparent"
                  initial={{ y: -32 }}
                  animate={{ y: 168 }}
                  transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
                />
              )}
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="mt-3 flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 transition-colors hover:border-brand-200 hover:bg-brand-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <code className="font-mono text-sm font-semibold tracking-[0.25em] text-ink-800">{g.qr_short_code}</code>
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} className="text-ink-400" />}
            </button>
            <p className="mt-1.5 text-center text-[11px] text-ink-400">Show this at the security desk</p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-sm text-ink-400">
            No pass issued yet — a QR appears here once this request is approved.
          </div>
        )}

        {/* Key facts */}
        <dl className="mt-5 space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <CalendarDays size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <dd className="text-ink-700">
              {formatWeekday(g.requested_date)}, {formatDate(g.requested_date)}
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <dd className="text-ink-700">{formatRange(g.start_time, g.end_time)}</dd>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <dd className="text-ink-700">
              {g.room_name
                ? [g.room_name, g.room_building, g.room_floor && `Floor ${g.room_floor}`].filter(Boolean).join(' · ')
                : 'Room not assigned yet'}
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <UserRound size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <dd className="text-ink-700">
              Hosted by <span className="font-medium">{g.authority_name}</span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Ticket-stub perforation along the bottom edge. */}
      <div className="flex justify-center gap-1.5 border-t border-dashed border-ink-200 bg-ink-50/60 px-5 py-2.5">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="h-1 w-1 shrink-0 rounded-full bg-ink-200" aria-hidden="true" />
        ))}
      </div>
    </motion.div>
  );
}

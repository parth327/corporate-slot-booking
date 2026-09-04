import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, DoorOpen, AlertCircle } from 'lucide-react';
import cn from '../../lib/cn.js';
import { roomApi } from '../../lib/api.js';
import { pageVariants } from '../../lib/motion.js';
import { statusMeta } from '../../lib/status.js';
import { BOARD_START_HOUR, BOARD_END_HOUR } from '../../lib/constants.js';
import { formatDate, formatWeekday, formatRange, todayISO, addDaysISO } from '../../lib/format.js';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card, { CardBody } from '../../components/ui/Card.jsx';
import DatePicker from '../../components/ui/DatePicker.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

const WINDOW_MINUTES = (BOARD_END_HOUR - BOARD_START_HOUR) * 60;
const HOURS = Array.from({ length: BOARD_END_HOUR - BOARD_START_HOUR + 1 }, (_, i) => BOARD_START_HOUR + i);

const BLOCK_TONE = {
  APPROVED: 'bg-brand-500/90 hover:bg-brand-600 text-white',
  CHECKED_IN: 'bg-emerald-500/90 hover:bg-emerald-600 text-white',
  COMPLETED: 'bg-ink-300 hover:bg-ink-400 text-ink-800',
};

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return Number.isNaN(h) ? 0 : h * 60 + (m || 0);
}

/** Percentage geometry for one booking inside the visible window. */
function geometry(booking) {
  const start = Math.max(toMinutes(booking.start_time), BOARD_START_HOUR * 60);
  const end = Math.min(toMinutes(booking.end_time), BOARD_END_HOUR * 60);
  const left = ((start - BOARD_START_HOUR * 60) / WINDOW_MINUTES) * 100;
  const width = Math.max(((end - start) / WINDOW_MINUTES) * 100, 2);
  return { left: `${left}%`, width: `${width}%`, visible: end > start };
}

export default function RoomBoard() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayISO());
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Room board · GatePass';
  }, []);

  const load = useCallback(async (day) => {
    setBoard(null);
    setError('');
    try {
      const schedules = await roomApi.scheduleAll({ date: day });
      setBoard(schedules);
    } catch (err) {
      setError(err.message);
      setBoard([]);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [load, date]);

  const shift = (days) => setDate((d) => addDaysISO(d, days));

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <PageHeader
        title="Room board"
        description="Every room's day at a glance. Tap a booking to open the request."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => shift(-1)}
              aria-label="Previous day"
              className="px-2.5"
            >
              <ChevronLeft size={16} />
            </Button>
            <DatePicker
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              containerClassName="w-44"
              aria-label="Board date"
            />
            <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Next day" className="px-2.5">
              <ChevronRight size={16} />
            </Button>
            {date !== todayISO() && (
              <Button variant="ghost" size="sm" onClick={() => setDate(todayISO())}>
                Today
              </Button>
            )}
          </div>
        }
      />

      <p className="mb-4 text-sm text-ink-500">
        {formatWeekday(date)}, {formatDate(date)}
      </p>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => load(date)}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {board === null ? (
        <Card>
          <CardBody className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32 shrink-0" />
                <Skeleton className="h-9 flex-1" />
              </div>
            ))}
          </CardBody>
        </Card>
      ) : board.length === 0 ? (
        <Card>
          <EmptyState
            icon={DoorOpen}
            title="No meeting rooms yet"
            description="An administrator can add rooms under the Rooms section."
          />
        </Card>
      ) : (
        <>
          {/* Desktop timeline ------------------------------------------------ */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <div className="min-w-[52rem]">
                <div className="flex border-b border-ink-100 bg-ink-50/60">
                  <div className="w-44 shrink-0 px-4 py-2.5 text-xs font-medium text-ink-400">Room</div>
                  <div className="relative flex-1">
                    <div className="flex">
                      {HOURS.slice(0, -1).map((h) => (
                        <div key={h} className="flex-1 border-l border-ink-100 px-2 py-2.5 text-[11px] text-ink-400">
                          {h % 12 === 0 ? 12 : h % 12}
                          {h < 12 ? 'am' : 'pm'}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {board.map(({ room, bookings }) => (
                  <div key={room.id} className="flex border-b border-ink-100 last:border-b-0">
                    <div className="w-44 shrink-0 px-4 py-3">
                      <p className="truncate text-sm font-medium text-ink-800">{room.name}</p>
                      <p className="truncate text-xs text-ink-400">
                        {[room.building, room.floor && `Floor ${room.floor}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    <div className="relative min-h-[3.75rem] flex-1">
                      <div className="absolute inset-0 flex" aria-hidden="true">
                        {HOURS.slice(0, -1).map((h) => (
                          <div key={h} className="flex-1 border-l border-ink-100" />
                        ))}
                      </div>

                      {bookings.length === 0 ? (
                        <p className="absolute inset-0 flex items-center pl-3 text-xs text-ink-300">
                          Free all day
                        </p>
                      ) : (
                        bookings.map((b) => {
                          const { left, width, visible } = geometry(b);
                          if (!visible) return null;
                          return (
                            <button
                              key={b.gatepass_id}
                              type="button"
                              onClick={() => navigate(`/authority/requests/${b.gatepass_id}`)}
                              style={{ left, width }}
                              title={`${b.visitor_name} · ${formatRange(b.start_time, b.end_time)} · ${b.authority_name}`}
                              aria-label={`${b.visitor_name}, ${formatRange(b.start_time, b.end_time)}, hosted by ${b.authority_name}`}
                              className={cn(
                                'absolute top-1/2 flex h-9 -translate-y-1/2 items-center overflow-hidden rounded-lg px-2 text-left text-[11px] font-medium transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                                BLOCK_TONE[b.display_status] || BLOCK_TONE.APPROVED
                              )}
                            >
                              <span className="truncate">
                                {b.visitor_name}
                                <span className="ml-1.5 opacity-80">{b.start_time}</span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Mobile list — a 14-hour track is unusable on a phone ------------- */}
          <div className="space-y-3 md:hidden">
            {board.map(({ room, bookings }) => (
              <Card key={room.id}>
                <CardBody className="p-4">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink-800">{room.name}</p>
                    <p className="shrink-0 text-xs text-ink-400">
                      {[room.building, room.floor && `Floor ${room.floor}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {bookings.length === 0 ? (
                    <p className="text-xs text-ink-300">Free all day</p>
                  ) : (
                    <ul className="divide-y divide-ink-100">
                      {bookings.map((b) => (
                        <li key={b.gatepass_id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/authority/requests/${b.gatepass_id}`)}
                            className="flex w-full items-center justify-between gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-ink-800">{b.visitor_name}</span>
                              <span className="block text-xs text-ink-400">
                                {formatRange(b.start_time, b.end_time)} · {b.authority_name}
                              </span>
                            </span>
                            <StatusBadge status={b.display_status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-500">
            {['APPROVED', 'CHECKED_IN', 'COMPLETED'].map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-sm', statusMeta(s).dotClassName)} aria-hidden="true" />
                {statusMeta(s).label}
              </span>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

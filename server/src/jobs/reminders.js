/**
 * GatePass — background sweeps.
 *
 * The reminder job claims rows *before* it sends anything: an atomic
 * `UPDATE ... WHERE reminder_sent_at IS NULL RETURNING id` means a slow mail
 * call can never produce a duplicate alert, even if the next tick overlaps.
 */
import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { GATEPASS_SELECT, serializeGatepass } from '../services/gatepassSerializer.js';
import { safeSend } from '../services/mailer.js';
import * as templates from '../services/templates.js';
import { orgNow, todayInOrgTz, minutesToTime } from '../utils/time.js';

/** The reminder fires when the meeting starts inside this window. */
const LEAD_MIN = 30;
const WINDOW_MIN = 2;

let reminderTask = null;
let overdueTask = null;
let reminderRunning = false;
let overdueRunning = false;

/**
 * Emails both parties 30 minutes before the meeting starts.
 * @returns {Promise<{sent:number}>}
 */
export async function runReminderSweep() {
  const now = orgNow();
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = minutesNow + LEAD_MIN - WINDOW_MIN;
  const to = minutesNow + LEAD_MIN + WINDOW_MIN;

  // A window that would run past midnight belongs to tomorrow's date; skip it
  // rather than send the wrong day's reminders.
  if (to >= 24 * 60) return { sent: 0 };

  const { rows: claimed } = await pool.query(
    `UPDATE gatepass_requests
        SET reminder_sent_at = now()
      WHERE id IN (
        SELECT id FROM gatepass_requests
         WHERE status = 'APPROVED'
           AND reminder_sent_at IS NULL
           AND requested_date = $1
           AND start_time >= $2::time
           AND start_time <= $3::time
      )
      RETURNING id`,
    [todayInOrgTz(), minutesToTime(from), minutesToTime(to)]
  );

  if (claimed.length === 0) return { sent: 0 };

  const ids = claimed.map((row) => row.id);
  const { rows } = await pool.query(`${GATEPASS_SELECT} WHERE g.id = ANY($1::int[])`, [ids]);

  let sent = 0;
  for (const row of rows) {
    const gatepass = serializeGatepass(row);
    const room = row.room_id
      ? {
          id: row.room_id,
          name: row.room_name,
          building: row.room_building,
          floor: row.room_floor,
        }
      : null;

    const okVisitor = await safeSend({
      to: [{ email: gatepass.visitor_email, name: gatepass.visitor_name }],
      ...templates.reminder30({ gatepass, room, recipientRole: 'VISITOR' }),
    });
    const okHost = await safeSend({
      to: [{ email: gatepass.authority_email, name: gatepass.authority_name }],
      ...templates.reminder30({ gatepass, room, recipientRole: 'AUTHORITY' }),
    });
    if (okVisitor || okHost) sent += 1;
  }

  console.log(`[cron] 30-minute reminders sent for ${sent} meeting(s)`);
  return { sent };
}

/**
 * Closes meetings still marked in progress well after they should have ended,
 * so a forgotten check-out does not hold a room forever.
 * @returns {Promise<{closed:number}>}
 */
export async function runOverdueSweep() {
  const { rows } = await pool.query(
    `UPDATE meeting_logs ml
        SET status = 'COMPLETED',
            actual_end = COALESCE(ml.actual_end, now()),
            updated_at = now()
       FROM gatepass_requests g
      WHERE g.id = ml.gatepass_id
        AND ml.status = 'IN_PROGRESS'
        AND ((g.requested_date + g.end_time) - make_interval(mins => $1)) < (now() - INTERVAL '2 hours')
      RETURNING ml.id`,
    [env.TZ_OFFSET_MINUTES]
  );

  if (rows.length > 0) {
    console.log(`[cron] closed ${rows.length} overdue meeting(s)`);
  }
  return { closed: rows.length };
}

/** Wraps a sweep so a failure is logged and never reaches the event loop. */
function guarded(name, fn, isRunning, setRunning) {
  return async () => {
    if (isRunning()) return;
    setRunning(true);
    try {
      await fn();
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err.message);
    } finally {
      setRunning(false);
    }
  };
}

export function startJobs() {
  if (!env.ENABLE_CRON) {
    console.log('[cron] disabled (ENABLE_CRON=false)');
    return;
  }
  if (reminderTask) return;

  reminderTask = cron.schedule(
    '* * * * *',
    guarded('reminder sweep', runReminderSweep, () => reminderRunning, (v) => {
      reminderRunning = v;
    })
  );

  overdueTask = cron.schedule(
    '*/5 * * * *',
    guarded('overdue sweep', runOverdueSweep, () => overdueRunning, (v) => {
      overdueRunning = v;
    })
  );

  console.log('[cron] started — reminders every minute, overdue sweep every 5 minutes');
}

export function stopJobs() {
  reminderTask?.stop();
  overdueTask?.stop();
  reminderTask = null;
  overdueTask = null;
}

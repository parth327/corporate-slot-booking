/**
 * GatePass unit tests — pure logic, no database, no network.
 *
 *   node --test tests/unit.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const rateLimit = (await import('../src/middleware/rateLimit.js')).default;
const { applySchema, v } = await import('../src/middleware/validate.js');
const time = await import('../src/utils/time.js');
const { buildIcs } = await import('../src/utils/ics.js');
const {
  signGatepassToken,
  verifyGatepassToken,
  signRescheduleToken,
  verifyRescheduleToken,
  makeShortCode,
} = await import('../src/utils/qr.js');
const { computeDisplayStatus, serializeGatepass } = await import(
  '../src/services/gatepassSerializer.js'
);
const { assertValidSlot } = await import('../src/services/booking.js');

// --- rate limiter -------------------------------------------------------------
// The e2e suite runs with NODE_ENV=test, which bypasses the limiter, so the real
// behaviour is pinned here instead.

test('rate limiter allows up to max and then refuses', () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 });
    const req = { ip: '1.2.3.4' };
    const res = { setHeader() {} };

    const errors = [];
    for (let i = 0; i < 5; i += 1) {
      limiter(req, res, (err) => errors.push(err));
    }
    assert.equal(errors.filter((e) => !e).length, 3, 'first three pass');
    const refused = errors.filter(Boolean);
    assert.equal(refused.length, 2);
    assert.equal(refused[0].status, 429);
    assert.equal(refused[0].code, 'RATE_LIMITED');
    limiter.stop();
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('rate limiter buckets are per key', () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const res = { setHeader() {} };
    let a;
    let b;
    limiter({ ip: '1.1.1.1' }, res, (e) => {
      a = e;
    });
    limiter({ ip: '2.2.2.2' }, res, (e) => {
      b = e;
    });
    assert.equal(a, undefined);
    assert.equal(b, undefined, 'a different address has its own budget');
    limiter.stop();
  } finally {
    process.env.NODE_ENV = saved;
  }
});

// --- validator ------------------------------------------------------------------

test('validator collects every field error, not just the first', () => {
  const { errors } = applySchema(
    {
      name: v.string({ required: true, min: 3 }),
      email: v.email({ required: true }),
      age: v.int({ required: true, min: 0 }),
    },
    { name: 'x', email: 'nope', age: 'abc' }
  );
  assert.equal(Object.keys(errors).length, 3);
});

test('validator rejects impossible calendar dates', () => {
  const { errors } = applySchema({ d: v.date() }, { d: '2026-02-31' });
  assert.ok(errors.d);
  const ok = applySchema({ d: v.date() }, { d: '2026-02-28' });
  assert.equal(Object.keys(ok.errors).length, 0);
});

test('validator normalises times to HH:mm and drops unknown keys', () => {
  const { value, errors } = applySchema(
    { t: v.time() },
    { t: '09:30:00', sneaky: 'should be dropped' }
  );
  assert.equal(Object.keys(errors).length, 0);
  assert.equal(value.t, '09:30');
  assert.equal(value.sneaky, undefined);
});

// --- time -----------------------------------------------------------------------

test('combineToInstant maps org-local wall time to the right UTC instant', () => {
  // The .env for this project runs at UTC+05:30, so 14:00 local is 08:30Z.
  const offset = time.ORG_OFFSET_MIN;
  const instant = time.combineToInstant('2026-09-10', '14:00');
  const expected = Date.UTC(2026, 8, 10, 14, 0) - offset * 60_000;
  assert.equal(instant.getTime(), expected);
});

test('minutesBetween and minutesToTime round trip', () => {
  assert.equal(time.minutesBetween('09:00', '10:30'), 90);
  assert.equal(time.minutesToTime(90), '01:30');
  assert.equal(time.normalizeTime('09:30:00'), '09:30', 'seconds are trimmed');
  assert.equal(time.normalizeTime('7:5'), null, 'unpadded input is rejected, not guessed at');
});

test('toDateOnly never shifts the day', () => {
  assert.equal(time.toDateOnly('2026-09-10'), '2026-09-10');
  assert.equal(time.toDateOnly(new Date(Date.UTC(2026, 8, 10, 0, 0))), '2026-09-10');
});

// --- slot rules -------------------------------------------------------------------

test('assertValidSlot enforces order, minimum and maximum duration', () => {
  const future = time.todayInOrgTz();
  assert.throws(
    () => assertValidSlot({ requested_date: future, start_time: '15:00', end_time: '14:00' }),
    /Validation failed/
  );
  assert.throws(
    () => assertValidSlot({ requested_date: future, start_time: '14:00', end_time: '14:05' }),
    /Validation failed/
  );
  assert.throws(
    () => assertValidSlot({ requested_date: future, start_time: '06:00', end_time: '20:00' }),
    /Validation failed/
  );
  assert.throws(
    () => assertValidSlot({ requested_date: '2020-01-01', start_time: '14:00', end_time: '15:00' }),
    /Validation failed/
  );
  assert.doesNotThrow(() =>
    assertValidSlot({ requested_date: future, start_time: '14:00', end_time: '15:00' })
  );
});

// --- QR ------------------------------------------------------------------------------

test('gatepass tokens round trip and reject the wrong type', () => {
  const token = signGatepassToken(42);
  assert.equal(verifyGatepassToken(token).gid, 42);

  const reschedule = signRescheduleToken(42);
  assert.equal(verifyRescheduleToken(reschedule).gid, 42);
  assert.throws(() => verifyGatepassToken(reschedule), /valid|recognised/i);
  assert.throws(() => verifyGatepassToken('garbage'), /valid|recognised/i);
});

test('short codes avoid characters people misread', () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(makeShortCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  }
});

// --- display status ------------------------------------------------------------------

test('display status follows the documented precedence', () => {
  const base = { status: 'APPROVED', check_in_time: null, check_out_time: null, meeting_status: null };
  assert.equal(computeDisplayStatus({ ...base, status: 'PENDING' }), 'PENDING');
  assert.equal(computeDisplayStatus(base), 'APPROVED');
  assert.equal(computeDisplayStatus({ ...base, check_in_time: new Date() }), 'CHECKED_IN');
  assert.equal(
    computeDisplayStatus({ ...base, check_in_time: new Date(), check_out_time: new Date() }),
    'COMPLETED'
  );
  assert.equal(
    computeDisplayStatus({ ...base, check_in_time: new Date(), meeting_status: 'EARLY_CLOSED' }),
    'COMPLETED',
    'an early close reads as complete even without a check-out'
  );
});

test('serializer hides the QR token unless explicitly asked', () => {
  const row = {
    id: 1,
    status: 'APPROVED',
    visitor_name: 'A',
    visitor_mobile: '1',
    visitor_email: 'a@b.c',
    authority_id: 2,
    reason: 'r',
    requested_date: '2026-09-10',
    start_time: '14:00:00',
    end_time: '15:00:00',
    qr_code_hash: 'secret-token',
    is_closed_early: false,
  };
  assert.equal(serializeGatepass(row).qr_code_hash, undefined);
  assert.equal(serializeGatepass(row, { includeQr: true }).qr_code_hash, 'secret-token');
  assert.equal(serializeGatepass(row).start_time, '14:00', 'seconds are trimmed');
});

// --- ICS ---------------------------------------------------------------------------------

test('buildIcs emits foldable, CRLF-terminated RFC 5545', () => {
  const ics = buildIcs({
    uid: 'gatepass-1@gatepass',
    title: 'Meeting; with, punctuation',
    description: 'Line one\nLine two',
    location: 'Sequoia, HQ, Floor 3',
    start: new Date(Date.UTC(2026, 8, 10, 8, 30)),
    end: new Date(Date.UTC(2026, 8, 10, 9, 30)),
    organizer: { name: 'Host', email: 'host@example.com' },
    attendees: [{ name: 'Visitor', email: 'visitor@example.com' }],
  });

  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('METHOD:REQUEST'));
  assert.ok(ics.includes('DTSTART:20260910T083000Z'));
  assert.ok(ics.includes('DTEND:20260910T093000Z'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.ok(!/\n(?<!\r\n)/.test(ics.replace(/\r\n/g, '')), 'no bare newlines');
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
  }
});

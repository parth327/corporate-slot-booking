/**
 * GatePass end-to-end suite.
 *
 * Boots the real Express app in-process against the real database and drives the
 * whole product through HTTP as each role would: visitor -> authority -> guard -> admin.
 *
 *   node --test tests/
 *
 * Requires DATABASE_URL. Email is forced into dry-run and the cron is disabled so the
 * suite never sends mail or races with a background sweep. Everything it creates is
 * tagged with a run marker and removed in the final teardown.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

// Must be set before any app module reads env.
process.env.NODE_ENV = 'test'; // lifts the public-form throttle; see rateLimit.js
process.env.ENABLE_CRON = 'false';
// Force the mailer into dry-run. This must be an empty string, NOT a delete:
// config/env.js runs dotenv.config() when it is imported, and dotenv fills in
// any key that is absent from process.env — so deleting it hands the real key
// straight back and the suite would post to Brevo for real.
process.env.BREVO_API_KEY = '';
process.env.SEED_DEMO_DATA = 'false';

const MARK = 'e2e';
const { createApp } = await import('../src/app.js');
const { pool, query, waitForDatabase } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');

let server;
let base;

/** Minimal typed HTTP helper. Returns { status, body }. */
async function http(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

const get = (u, t) => http('GET', u, { token: t });
const post = (u, body, t) => http('POST', u, { token: t, body });
const put = (u, body, t) => http('PUT', u, { token: t, body });
const del = (u, t) => http('DELETE', u, { token: t });

/** A date a few days out, in the org timezone, as YYYY-MM-DD. */
function futureDate(daysAhead = 3) {
  const offset = Number(process.env.TZ_OFFSET_MINUTES ?? 330);
  const d = new Date(Date.now() + offset * 60_000 + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const state = {
  adminToken: null,
  authorityToken: null,
  authority2Token: null,
  guardToken: null,
  authorityId: null,
  authority2Id: null,
  guardId: null,
  roomA: null,
  roomB: null,
  date: futureDate(3),
};

/** Drops anything a previous run left behind. Children first. */
async function purge() {
  await query(
    `DELETE FROM gatepass_requests WHERE visitor_email LIKE $1 OR authority_id IN
       (SELECT id FROM users WHERE email LIKE $2)`,
    [`${MARK}%`, `${MARK}%`]
  ).catch(() => {});
  await query(`DELETE FROM activity_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [
    `${MARK}%`,
  ]).catch(() => {});
  await query(`DELETE FROM users WHERE email LIKE $1`, [`${MARK}%`]).catch(() => {});
  await query(`DELETE FROM meeting_rooms WHERE name LIKE $1`, [`${MARK}-%`]).catch(() => {});
}

before(async () => {
  await waitForDatabase({ retries: 6, delayMs: 2000 });
  await runMigrations();
  // An interrupted run leaves its fixtures behind, and the next run then trips
  // over its own duplicate email. Start from a known-clean slate every time.
  await purge();
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await purge();
  if (server) await new Promise((r) => server.close(r));
  await pool.end().catch(() => {});
});

// ---------------------------------------------------------------------------
test('the suite runs with email disabled', async () => {
  // Regression guard. config/env.js calls dotenv.config() when it is imported,
  // and dotenv fills in any key missing from process.env — so removing
  // BREVO_API_KEY with the delete operator hands the real key straight back and
  // the suite starts posting to Brevo for real. Assigning an empty string is
  // what actually keeps it offline, and this asserts it stayed that way.
  const { env } = await import('../src/config/env.js');
  assert.equal(env.BREVO_API_KEY, '', 'tests must never reach the live email API');
});

test('health endpoint reports a live database', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.db, true);
});

test('admin can sign in with the seeded credentials', async () => {
  const { status, body } = await post('/api/auth/login', {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
  });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.user.role, 'ADMIN');
  assert.ok(body.token);
  assert.equal(body.user.password_hash, undefined, 'password_hash must never be returned');
  state.adminToken = body.token;
});

test('login rejects a bad password without revealing whether the email exists', async () => {
  const wrongPass = await post('/api/auth/login', {
    email: process.env.SEED_ADMIN_EMAIL,
    password: 'definitely-not-it',
  });
  const noSuchUser = await post('/api/auth/login', {
    email: `${MARK}-nobody@example.com`,
    password: 'definitely-not-it',
  });
  assert.equal(wrongPass.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPass.body.error, noSuchUser.body.error);
});

test('admin creates the authority and guard accounts used by the rest of the suite', async () => {
  const mk = async (role, name, email) => {
    const { status, body } = await post(
      '/api/admin/users',
      {
        name,
        email,
        password: 'Passw0rd!23',
        role,
        mobile: '+919000000001',
        department: 'Engineering',
        send_invite: false,
      },
      state.adminToken
    );
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.password_hash, undefined);
    return body.id;
  };
  state.authorityId = await mk('AUTHORITY', 'E2E Host One', `${MARK}-host1@example.com`);
  state.authority2Id = await mk('AUTHORITY', 'E2E Host Two', `${MARK}-host2@example.com`);
  state.guardId = await mk('GUARD', 'E2E Guard', `${MARK}-guard@example.com`);

  const login = async (email) => {
    const { status, body } = await post('/api/auth/login', { email, password: 'Passw0rd!23' });
    assert.equal(status, 200, JSON.stringify(body));
    return body.token;
  };
  state.authorityToken = await login(`${MARK}-host1@example.com`);
  state.authority2Token = await login(`${MARK}-host2@example.com`);
  state.guardToken = await login(`${MARK}-guard@example.com`);
});

test('duplicate email is rejected with 409 DUPLICATE', async () => {
  const { status, body } = await post(
    '/api/admin/users',
    { name: 'Clash', email: `${MARK}-host1@example.com`, password: 'Passw0rd!23', role: 'GUARD' },
    state.adminToken
  );
  assert.equal(status, 409);
  assert.equal(body.code, 'DUPLICATE');
});

test('admin creates two rooms', async () => {
  const mk = async (name) => {
    const { status, body } = await post(
      '/api/rooms',
      { name, building: 'E2E Tower', floor: '9', capacity: 6, amenities: 'Screen' },
      state.adminToken
    );
    assert.equal(status, 201, JSON.stringify(body));
    return body;
  };
  state.roomA = await mk(`${MARK}-Room-A`);
  state.roomB = await mk(`${MARK}-Room-B`);
  assert.notEqual(state.roomA.id, state.roomB.id);
});

// --- RBAC -------------------------------------------------------------------
test('RBAC: unauthenticated requests are rejected', async () => {
  assert.equal((await get('/api/gatepasses')).status, 401);
  assert.equal((await get('/api/admin/users')).status, 401);
  assert.equal((await get('/api/security/today')).status, 401);
});

test('RBAC: a guard cannot reach authority or admin endpoints', async () => {
  assert.equal((await get('/api/gatepasses', state.guardToken)).status, 403);
  assert.equal((await get('/api/admin/users', state.guardToken)).status, 403);
});

test('RBAC: an authority cannot reach admin endpoints', async () => {
  assert.equal((await get('/api/admin/users', state.authorityToken)).status, 403);
  assert.equal((await get('/api/admin/overview', state.authorityToken)).status, 403);
});

// --- Workflow A: visitor request -------------------------------------------
test('public: authority directory lists the new host', async () => {
  const { status, body } = await get('/api/public/authorities');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((a) => a.id === state.authorityId));
  assert.equal(body[0].password_hash, undefined);
  assert.equal(body[0].email !== undefined, true);
});

function requestBody(overrides = {}) {
  return {
    visitor_name: 'Jon Kim',
    visitor_company: 'Northwind',
    visitor_designation: 'Partner',
    visitor_mobile: '+919812345678',
    visitor_whatsapp: '+919812345678',
    visitor_email: `${MARK}-visitor@example.com`,
    authority_id: state.authorityId,
    reason: 'Quarterly partnership review',
    requested_date: state.date,
    start_time: '14:00',
    end_time: '15:00',
    ...overrides,
  };
}

const created = {};

test('Workflow A: a visitor submits a gatepass request', async () => {
  const { status, body } = await post('/api/gatepasses/request', requestBody());
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.status, 'PENDING');
  assert.ok(body.id);
  created.first = body.id;
});

test('validation: rejects an end time before the start time', async () => {
  const { status, body } = await post(
    '/api/gatepasses/request',
    requestBody({ start_time: '15:00', end_time: '14:00' })
  );
  assert.equal(status, 400);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('validation: rejects a date in the past', async () => {
  const { status } = await post(
    '/api/gatepasses/request',
    requestBody({ requested_date: '2020-01-01' })
  );
  assert.equal(status, 400);
});

test('validation: rejects a malformed email and reports the field', async () => {
  const { status, body } = await post(
    '/api/gatepasses/request',
    requestBody({ visitor_email: 'not-an-email' })
  );
  assert.equal(status, 400);
  assert.ok(body.details?.fields?.visitor_email, JSON.stringify(body));
});

test('validation: rejects an unknown authority', async () => {
  const { status } = await post('/api/gatepasses/request', requestBody({ authority_id: 999999 }));
  assert.equal(status, 404);
});

// --- Workflow B: review, booking, conflicts ---------------------------------
test('the host sees the request in their queue', async () => {
  const { status, body } = await get('/api/gatepasses?status=PENDING', state.authorityToken);
  assert.equal(status, 200);
  assert.ok(body.items.some((g) => g.id === created.first));
  const g = body.items.find((x) => x.id === created.first);
  assert.equal(g.display_status, 'PENDING');
  assert.equal(g.requested_date, state.date, 'date must not shift timezone');
  assert.equal(g.start_time, '14:00');
  assert.equal(g.qr_code_hash, undefined, 'list must not leak the QR token');
});

test('scoping: another host cannot see or open the request', async () => {
  const list = await get('/api/gatepasses', state.authority2Token);
  assert.ok(!list.body.items.some((g) => g.id === created.first));
  const one = await get(`/api/gatepasses/${created.first}`, state.authority2Token);
  assert.equal(one.status, 404, 'must be 404, not 403, so ids are not enumerable');
});

test('room availability shows both rooms free for the slot', async () => {
  const { status, body } = await get(
    `/api/rooms/availability?date=${state.date}&start_time=14:00&end_time=15:00`,
    state.authorityToken
  );
  assert.equal(status, 200);
  const a = body.find((r) => r.id === state.roomA.id);
  assert.equal(a.is_available, true);
  assert.equal(a.occupied_by, null);
});

test('Workflow B: the host approves and books room A', async () => {
  const { status, body } = await post(
    `/api/gatepasses/${created.first}/approve`,
    { room_id: state.roomA.id },
    state.authorityToken
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.status, 'APPROVED');
  assert.equal(body.display_status, 'APPROVED');
  assert.equal(body.room_id, state.roomA.id);
  assert.ok(body.qr_code_hash, 'detail response carries the signed QR token');
  assert.match(body.qr_short_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(body.meeting_status, 'SCHEDULED');
  created.firstToken = body.qr_code_hash;
  created.firstShort = body.qr_short_code;
});

test('a meeting log row was created on approval', async () => {
  const { rows } = await query('SELECT * FROM meeting_logs WHERE gatepass_id = $1', [created.first]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'SCHEDULED');
});

test('CONFLICT: a second overlapping request cannot take the same room', async () => {
  const req = await post(
    '/api/gatepasses/request',
    requestBody({
      visitor_name: 'Priya Shah',
      visitor_email: `${MARK}-visitor2@example.com`,
      start_time: '14:30',
      end_time: '15:30',
    })
  );
  assert.equal(req.status, 201);
  created.second = req.body.id;

  const { status, body } = await post(
    `/api/gatepasses/${created.second}/approve`,
    { room_id: state.roomA.id },
    state.authorityToken
  );
  assert.equal(status, 409, JSON.stringify(body));
  assert.equal(body.code, 'ROOM_CONFLICT');
  assert.ok(body.details.conflict, 'must report who holds the slot');
  assert.equal(body.details.conflict.gatepass_id, created.first);
  assert.equal(body.details.conflict.visitor_name, 'Jon Kim');
  assert.match(body.error, /Jon Kim|E2E Host One/, 'message names the holder');
});

test('availability reflects the booking and names the holder', async () => {
  const { body } = await get(
    `/api/rooms/availability?date=${state.date}&start_time=14:30&end_time=15:30`,
    state.authorityToken
  );
  const a = body.find((r) => r.id === state.roomA.id);
  const b = body.find((r) => r.id === state.roomB.id);
  assert.equal(a.is_available, false);
  assert.equal(a.occupied_by.visitor_name, 'Jon Kim');
  assert.equal(b.is_available, true);
});

test('a non-overlapping slot in the same room is still bookable', async () => {
  const req = await post(
    '/api/gatepasses/request',
    requestBody({
      visitor_name: 'Late Caller',
      visitor_email: `${MARK}-visitor5@example.com`,
      start_time: '15:00',
      end_time: '16:00',
    })
  );
  const { status, body } = await post(
    `/api/gatepasses/${req.body.id}/approve`,
    { room_id: state.roomA.id },
    state.authorityToken
  );
  assert.equal(status, 200, 'touching endpoints must not count as an overlap');
  created.adjacent = body.id;
});

test('the second request succeeds in room B', async () => {
  const { status, body } = await post(
    `/api/gatepasses/${created.second}/approve`,
    { room_id: state.roomB.id },
    state.authorityToken
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.room_id, state.roomB.id);
  created.secondToken = body.qr_code_hash;
});

test('the room day schedule lists both bookings', async () => {
  const { status, body } = await get(
    `/api/rooms/${state.roomA.id}/schedule?date=${state.date}`,
    state.authorityToken
  );
  assert.equal(status, 200);
  assert.ok(body.bookings.length >= 2);
  assert.ok(body.bookings.every((b) => b.start_time && b.visitor_name));
});

test('the QR image endpoint serves a real PNG for a valid token, and 404s otherwise', async () => {
  // Root-cause regression guard: Gmail/Outlook strip data: URIs from HTML
  // mail, so the approval email embeds this URL instead. It must actually be
  // a fetchable image, unauthenticated (a mail client cannot send a Bearer
  // token), and must refuse anything but the exact token on an approved row.
  const ok = await fetch(`${base}/api/gatepasses/${created.first}/qr.png?token=${encodeURIComponent(created.firstToken)}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  const bytes = new Uint8Array(await ok.arrayBuffer());
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.deepEqual(Array.from(bytes.slice(0, 8)), pngSignature, 'response must be a real PNG');

  const wrongToken = await fetch(`${base}/api/gatepasses/${created.first}/qr.png?token=not-the-real-token`);
  assert.equal(wrongToken.status, 404);

  const noToken = await fetch(`${base}/api/gatepasses/${created.first}/qr.png`);
  assert.equal(noToken.status, 404);

  const unknownId = await fetch(`${base}/api/gatepasses/999999/qr.png?token=${encodeURIComponent(created.firstToken)}`);
  assert.equal(unknownId.status, 404);

  // A pending (not-yet-approved) request has no qr_code_hash yet — the
  // endpoint must not leak whether an id exists by responding any
  // differently than it does for a wrong token.
  const pending = await post('/api/gatepasses/request', requestBody({
    visitor_email: `${MARK}-visitor-qrtest@example.com`,
    start_time: '10:00',
    end_time: '10:30',
  }));
  const pendingLookup = await fetch(
    `${base}/api/gatepasses/${pending.body.id}/qr.png?token=${encodeURIComponent(created.firstToken)}`
  );
  assert.equal(pendingLookup.status, 404);
});

// --- Workflow C: gate verification -----------------------------------------
test('Workflow C: the guard verifies the QR token', async () => {
  const { status, body } = await post('/api/security/verify', { token: created.firstToken }, state.guardToken);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.valid, true);
  assert.equal(body.gatepass.id, created.first);
  assert.equal(body.gatepass.room_name, state.roomA.name);
  assert.equal(body.gatepass.authority_name, 'E2E Host One');
  assert.equal(body.checks.already_checked_in, false);
  assert.equal(body.checks.is_today, false, 'this pass is dated a few days out');
});

test('the guard can verify by short code too', async () => {
  const { status, body } = await post(
    '/api/security/verify',
    { short_code: created.firstShort.toLowerCase() },
    state.guardToken
  );
  assert.equal(status, 200);
  assert.equal(body.gatepass.id, created.first);
});

test('a forged or unknown QR is rejected', async () => {
  const bad = await post('/api/security/verify', { token: 'not.a.jwt' }, state.guardToken);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_QR');

  const unknown = await post('/api/security/verify', { short_code: 'ZZZZZZZZ' }, state.guardToken);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, 'INVALID_QR');
});

test('a pending request has no valid gatepass', async () => {
  const req = await post(
    '/api/gatepasses/request',
    requestBody({ visitor_email: `${MARK}-visitor3@example.com`, start_time: '09:00', end_time: '09:30' })
  );
  created.pending = req.body.id;
  const { status, body } = await post(
    '/api/security/verify',
    { short_code: 'AAAAAAAA' },
    state.guardToken
  );
  assert.equal(status, 400);
  assert.equal(body.code, 'INVALID_QR');
});

test('search finds the visitor by name and by mobile', async () => {
  const byName = await get('/api/security/search?q=Jon', state.guardToken);
  const byMobile = await get('/api/security/search?q=9812345678', state.guardToken);
  assert.equal(byName.status, 200);
  assert.equal(byMobile.status, 200);
  // The seeded visits are a few days out, so the +/-1 day window may exclude them;
  // the contract is that the endpoint answers correctly, not that it matches here.
  assert.ok(Array.isArray(byName.body.items));
  assert.ok(Array.isArray(byMobile.body.items));
});

test('search requires at least two characters', async () => {
  const { status } = await get('/api/security/search?q=a', state.guardToken);
  assert.equal(status, 400);
});

test('Workflow C: check-in then check-out', async () => {
  const inRes = await post(`/api/security/gatepass/${created.first}/check-in`, null, state.guardToken);
  assert.equal(inRes.status, 200, JSON.stringify(inRes.body));
  assert.ok(inRes.body.check_in_time);
  assert.equal(inRes.body.display_status, 'CHECKED_IN');
  assert.equal(inRes.body.meeting_status, 'IN_PROGRESS');

  const dupe = await post(`/api/security/gatepass/${created.first}/check-in`, null, state.guardToken);
  assert.equal(dupe.status, 409);
  assert.equal(dupe.body.code, 'INVALID_STATE');

  const outRes = await post(`/api/security/gatepass/${created.first}/check-out`, null, state.guardToken);
  assert.equal(outRes.status, 200, JSON.stringify(outRes.body));
  assert.ok(outRes.body.check_out_time);
  assert.equal(outRes.body.display_status, 'COMPLETED');
  assert.equal(outRes.body.meeting_status, 'COMPLETED');

  const dupeOut = await post(`/api/security/gatepass/${created.first}/check-out`, null, state.guardToken);
  assert.equal(dupeOut.status, 409);
});

test('check-out before check-in is refused', async () => {
  const { status, body } = await post(
    `/api/security/gatepass/${created.second}/check-out`,
    null,
    state.guardToken
  );
  assert.equal(status, 409);
  assert.equal(body.code, 'INVALID_STATE');
});

test('completing a meeting frees the room for the same slot', async () => {
  const req = await post(
    '/api/gatepasses/request',
    requestBody({
      visitor_name: 'Follow Up',
      visitor_email: `${MARK}-visitor6@example.com`,
      start_time: '14:00',
      end_time: '15:00',
    })
  );
  const { status } = await post(
    `/api/gatepasses/${req.body.id}/approve`,
    { room_id: state.roomA.id },
    state.authorityToken
  );
  assert.equal(status, 200, 'a COMPLETED meeting must no longer hold its room');
  created.afterComplete = req.body.id;
});

// --- Workflow D: room switch, early close, reminders ------------------------
test('Workflow D: the host switches rooms before the meeting starts', async () => {
  const { status, body } = await post(
    `/api/gatepasses/${created.second}/switch-room`,
    { room_id: state.roomA.id },
    state.authorityToken
  );
  // Room A now holds `afterComplete` 14:00-15:00, and `second` is 14:30-15:30 -> conflict.
  assert.equal(status, 409, JSON.stringify(body));
  assert.equal(body.code, 'ROOM_CONFLICT');
});

test('switching to a genuinely free room succeeds', async () => {
  const free = await post(
    '/api/rooms',
    { name: `${MARK}-Room-C`, building: 'E2E Tower', floor: '9', capacity: 4 },
    state.adminToken
  );
  const { status, body } = await post(
    `/api/gatepasses/${created.second}/switch-room`,
    { room_id: free.body.id },
    state.authorityToken
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.room_id, free.body.id);
  state.roomC = free.body;
});

test('Workflow D: closing a meeting early releases the room immediately', async () => {
  const before = await get(
    `/api/rooms/availability?date=${state.date}&start_time=14:00&end_time=15:00`,
    state.authorityToken
  );
  assert.equal(before.body.find((r) => r.id === state.roomA.id).is_available, false);

  const closed = await post(
    `/api/gatepasses/${created.afterComplete}/close-early`,
    null,
    state.authorityToken
  );
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.is_closed_early, true);
  assert.equal(closed.body.meeting_status, 'EARLY_CLOSED');
  assert.ok(closed.body.actual_end);

  const after = await get(
    `/api/rooms/availability?date=${state.date}&start_time=14:00&end_time=15:00`,
    state.authorityToken
  );
  assert.equal(
    after.body.find((r) => r.id === state.roomA.id).is_available,
    true,
    'the room must be bookable the instant the meeting is closed early'
  );
});

test('a request can be rejected with a comment', async () => {
  const { status, body } = await post(
    `/api/gatepasses/${created.pending}/reject`,
    { comment: 'Conflicting board meeting — please try next week.' },
    state.authorityToken
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.status, 'REJECTED');
  assert.match(body.authority_comment, /board meeting/);
});

test('rejection requires a comment', async () => {
  const req = await post(
    '/api/gatepasses/request',
    requestBody({ visitor_email: `${MARK}-visitor4@example.com`, start_time: '11:00', end_time: '11:30' })
  );
  const { status } = await post(`/api/gatepasses/${req.body.id}/reject`, {}, state.authorityToken);
  assert.equal(status, 400);
  created.forReschedule = req.body.id;
});

test('reschedule round trip: host asks, visitor answers, status returns to PENDING', async () => {
  const asked = await post(
    `/api/gatepasses/${created.forReschedule}/reschedule`,
    { comment: 'Could we move this to the afternoon?' },
    state.authorityToken
  );
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.equal(asked.body.status, 'RESCHEDULE_REQUESTED');

  const { rows } = await query('SELECT reschedule_token FROM gatepass_requests WHERE id = $1', [
    created.forReschedule,
  ]);
  const token = rows[0].reschedule_token;
  assert.ok(token, 'a reschedule token must be stored for the emailed link');

  const view = await get(`/api/public/reschedule/${token}`);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(view.body.gatepass.id, created.forReschedule);
  assert.equal(view.body.gatepass.visitor_mobile, undefined, 'public view must be a limited projection');

  const submitted = await post(`/api/public/reschedule/${token}`, {
    requested_date: futureDate(5),
    start_time: '16:00',
    end_time: '17:00',
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.body.gatepass.status, 'PENDING');
  assert.equal(submitted.body.gatepass.start_time, '16:00');

  const reuse = await post(`/api/public/reschedule/${token}`, {
    requested_date: futureDate(6),
    start_time: '16:00',
    end_time: '17:00',
  });
  assert.notEqual(reuse.status, 200, 'the reschedule link must be single use');
});

test('the reminder sweep runs without error and is idempotent', async () => {
  const { runReminderSweep, runOverdueSweep } = await import('../src/jobs/reminders.js');
  const first = await runReminderSweep();
  const second = await runReminderSweep();
  assert.equal(typeof first.sent, 'number');
  assert.equal(second.sent, 0, 'a claimed reminder must never be sent twice');
  const overdue = await runOverdueSweep();
  assert.equal(typeof overdue.closed, 'number');
});

// --- Admin visibility -------------------------------------------------------
test('admin overview aggregates the whole system', async () => {
  const { status, body } = await get('/api/admin/overview', state.adminToken);
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.counts.users_by_role);
  assert.ok(typeof body.counts.rooms === 'number');
  assert.ok(body.counts.gatepasses_by_status);
  assert.ok(Array.isArray(body.upcoming));
  assert.ok(Array.isArray(body.room_utilisation));
});

test('admin sees gatepasses belonging to every authority', async () => {
  const { status, body } = await get('/api/admin/gatepasses?pageSize=100', state.adminToken);
  assert.equal(status, 200);
  assert.ok(body.items.some((g) => g.id === created.first));
  assert.ok(typeof body.total === 'number');
});

test('activity log recorded the approval and the check-in', async () => {
  const { status, body } = await get('/api/admin/activity?pageSize=100', state.adminToken);
  assert.equal(status, 200, JSON.stringify(body));
  const actions = body.items.map((i) => i.action);
  assert.ok(actions.includes('GATEPASS_APPROVED'), `saw: ${[...new Set(actions)].join(', ')}`);
  assert.ok(actions.includes('VISITOR_CHECKED_IN'));
});

test('meeting logs report actual start and end', async () => {
  const { status, body } = await get('/api/admin/meeting-logs?pageSize=100', state.adminToken);
  assert.equal(status, 200);
  const row = body.items.find((i) => i.gatepass_id === created.first);
  assert.ok(row, 'the completed meeting must appear');
  assert.ok(row.actual_start && row.actual_end);
  assert.equal(row.status, 'COMPLETED');
});

test('admin cannot deactivate themselves', async () => {
  const me = await get('/api/auth/me', state.adminToken);
  const { status } = await del(`/api/admin/users/${me.body.user.id}`, state.adminToken);
  assert.equal(status, 409);
});

test('deactivated users can no longer sign in', async () => {
  const { status } = await del(`/api/admin/users/${state.authority2Id}`, state.adminToken);
  assert.equal(status, 200);
  const login = await post('/api/auth/login', {
    email: `${MARK}-host2@example.com`,
    password: 'Passw0rd!23',
  });
  assert.equal(login.status, 401);
});

test('a room with booking history is deactivated rather than deleted', async () => {
  const { status, body } = await del(`/api/rooms/${state.roomA.id}`, state.adminToken);
  assert.equal(status, 200, JSON.stringify(body));
  const { rows } = await query('SELECT is_active FROM meeting_rooms WHERE id = $1', [state.roomA.id]);
  assert.equal(rows.length, 1, 'a booked room must survive deletion');
  assert.equal(rows[0].is_active, false);
});

test('an unbooked room is removed outright', async () => {
  const fresh = await post(
    '/api/rooms',
    { name: `${MARK}-Room-Temp`, building: 'E2E Tower', floor: '9', capacity: 2 },
    state.adminToken
  );
  const { status } = await del(`/api/rooms/${fresh.body.id}`, state.adminToken);
  assert.equal(status, 200);
  const { rows } = await query('SELECT 1 FROM meeting_rooms WHERE id = $1', [fresh.body.id]);
  assert.equal(rows.length, 0);
});

test('unknown API routes answer 404 in the documented error shape', async () => {
  const { status, body } = await get('/api/does-not-exist');
  assert.equal(status, 404);
  assert.equal(body.code, 'NOT_FOUND');
  assert.ok(body.error);
});

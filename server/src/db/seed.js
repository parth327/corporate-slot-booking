/**
 * GatePass — bootstrap / demo seeding.
 *
 * `seedBootstrap()` is idempotent and runs on every boot:
 *   1. creates the bootstrap ADMIN (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) only
 *      when no active ADMIN exists;
 *   2. when SEED_DEMO_DATA is true, inserts six meeting rooms across two
 *      buildings plus three AUTHORITY and two GUARD accounts.
 *
 * Every insert relies on ON CONFLICT ... DO NOTHING against the unique indexes
 * created by schema.sql, so re-runs never duplicate anything. Only credentials
 * this run actually created are printed — existing accounts are never touched.
 *
 * Usable as a library (`seedBootstrap()`) and as a CLI (`node src/db/seed.js`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, closePool } from './pool.js';
import env, { assertRequiredEnv } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);

/** bcrypt cost, per docs/CONTRACT.md section 9. */
const BCRYPT_ROUNDS = 10;

/** Shared password for every demo (non-admin) account. */
export const DEMO_PASSWORD = 'Passw0rd!23';

/** Six rooms across two buildings, varied floors / capacities / amenities. */
const DEMO_ROOMS = [
  { name: 'Sequoia', building: 'HQ', floor: '3', capacity: 8, amenities: 'TV, Whiteboard, Video conferencing' },
  { name: 'Redwood', building: 'HQ', floor: '3', capacity: 12, amenities: 'Projector, Whiteboard, Speakerphone' },
  { name: 'Banyan', building: 'HQ', floor: '1', capacity: 4, amenities: 'Whiteboard' },
  { name: 'Cedar', building: 'Annexe', floor: '2', capacity: 6, amenities: 'TV, Speakerphone' },
  { name: 'Willow', building: 'Annexe', floor: '2', capacity: 20, amenities: 'Projector, Podium, PA system, Video conferencing' },
  { name: 'Maple', building: 'Annexe', floor: '4', capacity: 10, amenities: 'TV, Whiteboard, Balcony access' },
];

/** Three authorities and two guards. */
const DEMO_USERS = [
  { name: 'Asha Rao', email: 'asha.rao@gatepass.local', role: 'AUTHORITY', mobile: '+919800000101', department: 'Engineering', designation: 'Director of Engineering' },
  { name: 'Vikram Nair', email: 'vikram.nair@gatepass.local', role: 'AUTHORITY', mobile: '+919800000102', department: 'Finance', designation: 'VP Finance' },
  { name: 'Meera Iyer', email: 'meera.iyer@gatepass.local', role: 'AUTHORITY', mobile: '+919800000103', department: 'People Ops', designation: 'Head of People' },
  { name: 'Ramesh Kumar', email: 'ramesh.kumar@gatepass.local', role: 'GUARD', mobile: '+919800000201', department: 'Security', designation: 'Gate Officer' },
  { name: 'Sunil Yadav', email: 'sunil.yadav@gatepass.local', role: 'GUARD', mobile: '+919800000202', department: 'Security', designation: 'Gate Officer' },
];

const INSERT_USER_SQL = `
  INSERT INTO users (name, email, password_hash, role, mobile, department, designation, is_active)
  VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
  ON CONFLICT (lower(email)) DO NOTHING
  RETURNING id, name, email, role`;

const INSERT_ROOM_SQL = `
  INSERT INTO meeting_rooms (name, building, floor, capacity, amenities, is_active)
  VALUES ($1, $2, $3, $4, $5, TRUE)
  ON CONFLICT (name, building, floor) DO NOTHING
  RETURNING id, name, building, floor`;

/**
 * Inserts a user unless the email is already taken.
 * @returns {Promise<{ created: boolean, user?: object }>}
 */
async function insertUser({ name, email, password, role, mobile = null, department = null, designation = null }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rows } = await pool.query(INSERT_USER_SQL, [
    name,
    email.toLowerCase(),
    passwordHash,
    role,
    mobile,
    department,
    designation,
  ]);
  return rows.length > 0 ? { created: true, user: rows[0] } : { created: false };
}

/**
 * Creates the bootstrap admin when no active ADMIN exists.
 * @returns {Promise<boolean>} true when an admin was created by this run
 */
async function seedAdmin() {
  const { rows } = await pool.query(
    "SELECT id, email FROM users WHERE role = 'ADMIN' AND is_active = TRUE LIMIT 1",
  );
  if (rows.length > 0) {
    console.log(`[seed] admin already present (${rows[0].email}) — skipping bootstrap admin`);
    return false;
  }

  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  const result = await insertUser({
    name: 'GatePass Administrator',
    email,
    password,
    role: 'ADMIN',
    department: 'Administration',
    designation: 'System Administrator',
  });

  if (!result.created) {
    console.warn(
      `[seed] no active ADMIN exists but "${email}" is already taken by another account. ` +
        'Reactivate or promote that user, or set SEED_ADMIN_EMAIL to a free address.',
    );
    return false;
  }

  console.log('[seed] created ADMIN');
  console.log(`[seed]   email    : ${email}`);
  console.log(`[seed]   password : ${password}`);
  console.log('[seed]   change this password after the first login.');
  return true;
}

/**
 * Inserts the demo rooms.
 * @returns {Promise<number>} number of rooms created by this run
 */
async function seedRooms() {
  let created = 0;
  for (const room of DEMO_ROOMS) {
    const { rows } = await pool.query(INSERT_ROOM_SQL, [
      room.name,
      room.building,
      room.floor,
      room.capacity,
      room.amenities,
    ]);
    if (rows.length > 0) {
      created += 1;
      console.log(`[seed] created room ${rows[0].name} (${rows[0].building} · floor ${rows[0].floor})`);
    }
  }
  if (created === 0) console.log('[seed] demo rooms already present — nothing to do');
  return created;
}

/**
 * Inserts the demo authority + guard accounts.
 * @returns {Promise<number>} number of users created by this run
 */
async function seedDemoUsers() {
  // Look up what already exists first so a normal boot does no bcrypt work at all.
  // Matched on email OR mobile: an admin renaming a demo account's email (its
  // only editable unique field) must not make this insert a second copy of the
  // same person on the next boot, since mobile stays the stable identifier.
  const emails = DEMO_USERS.map((u) => u.email.toLowerCase());
  const mobiles = DEMO_USERS.map((u) => u.mobile);
  const { rows: existing } = await pool.query(
    'SELECT lower(email) AS email, mobile FROM users WHERE lower(email) = ANY($1::text[]) OR mobile = ANY($2::text[])',
    [emails, mobiles],
  );
  const takenEmails = new Set(existing.map((row) => row.email));
  const takenMobiles = new Set(existing.map((row) => row.mobile).filter(Boolean));

  const created = [];
  for (const demo of DEMO_USERS) {
    if (takenEmails.has(demo.email.toLowerCase()) || takenMobiles.has(demo.mobile)) continue;
    const result = await insertUser({ ...demo, password: DEMO_PASSWORD });
    if (result.created) created.push(result.user);
  }

  if (created.length === 0) {
    console.log('[seed] demo users already present — nothing to do');
    return 0;
  }

  console.log(`[seed] created ${created.length} demo user(s), all with password: ${DEMO_PASSWORD}`);
  for (const user of created) {
    console.log(`[seed]   ${user.role.padEnd(9)} ${user.email}`);
  }
  return created.length;
}

/**
 * Idempotent bootstrap seeding. Safe to call on every boot.
 * @returns {Promise<{ adminCreated: boolean, roomsCreated: number, usersCreated: number }>}
 */
export async function seedBootstrap() {
  const adminCreated = await seedAdmin();

  let roomsCreated = 0;
  let usersCreated = 0;
  if (env.SEED_DEMO_DATA) {
    roomsCreated = await seedRooms();
    usersCreated = await seedDemoUsers();
  } else {
    console.log('[seed] SEED_DEMO_DATA is off — skipping demo rooms and users');
  }

  return { adminCreated, roomsCreated, usersCreated };
}

/** True when this module was started directly by node, rather than imported. */
function isCliInvocation() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(__filename);
  } catch {
    return false;
  }
}

if (isCliInvocation()) {
  try {
    assertRequiredEnv();
    await seedBootstrap();
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error(`[seed] ${err?.message || err}`);
    if (String(err?.code) === '42P01') {
      console.error('[seed] the schema is missing — run `npm run migrate` first.');
    }
    await closePool();
    process.exit(1);
  }
}

export default seedBootstrap;

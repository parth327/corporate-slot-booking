/**
 * GatePass — sign in, identity, password change.
 */
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { ApiError } from '../middleware/error.js';
import { signAuthToken } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';

/** The same message whichever half of the credential pair was wrong. */
const BAD_CREDENTIALS = 'Invalid email or password.';

/** Everything about a user that is safe to hand back. */
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mobile: row.mobile ?? null,
    department: row.department ?? null,
    designation: row.designation ?? null,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

/** Passwords must survive a shoulder-surf: 8+ chars with a letter and a digit. */
export function assertPasswordStrength(password, field = 'password') {
  const problems = [];
  if (!password || password.length < 8) problems.push('must be at least 8 characters');
  if (!/[A-Za-z]/.test(password || '')) problems.push('must contain a letter');
  if (!/\d/.test(password || '')) problems.push('must contain a digit');
  if (problems.length) {
    throw ApiError.badRequest('Validation failed', { fields: { [field]: problems.join(', ') } });
  }
}

export async function login(req, res) {
  const { email, password } = req.body;

  const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];

  // Always run a comparison so a missing user and a wrong password cost the same.
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok || !user.is_active) {
    // Fire-and-forget: logActivity is a best-effort audit write that never
    // throws, so awaiting it would only add a second WAN round trip to a
    // request the caller needs a fast answer on either way.
    logActivity({
      userId: user?.id ?? null,
      actorLabel: user ? undefined : `Unknown (${email})`,
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: user?.id ?? null,
      meta: { email, reason: !user ? 'no_such_user' : !ok ? 'bad_password' : 'inactive' },
      ip: req.ip,
    });
    throw ApiError.unauthorized(
      user && ok && !user.is_active ? 'This account has been deactivated.' : BAD_CREDENTIALS
    );
  }

  logActivity({
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip,
  });

  res.json({ token: signAuthToken(user), user: publicUser(user) });
}

/** Re-reads the row so a token issued before a deactivation stops working. */
export async function me(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !user.is_active) {
    throw ApiError.unauthorized('This account is no longer active.');
  }
  res.json({ user: publicUser(user) });
}

export async function changePassword(req, res) {
  const { current_password: current, new_password: next } = req.body;

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user) throw ApiError.unauthorized('This account is no longer active.');

  const ok = await bcrypt.compare(current, user.password_hash);
  if (!ok) {
    throw ApiError.badRequest('Validation failed', {
      fields: { current_password: 'is not correct' },
    });
  }

  assertPasswordStrength(next, 'new_password');
  if (current === next) {
    throw ApiError.badRequest('Validation failed', {
      fields: { new_password: 'must be different from the current password' },
    });
  }

  await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
    await bcrypt.hash(next, 10),
    user.id,
  ]);

  logActivity({
    userId: user.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.id,
    ip: req.ip,
  });

  res.json({ ok: true });
}

export { publicUser };

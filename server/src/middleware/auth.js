/**
 * GatePass — stateless JWT authentication.
 *
 * Tokens are HS256, valid 12h, payload `{ sub, role, name, email }`
 * (docs/CONTRACT.md section 4). Verification touches the database not at all:
 * a deactivated user keeps a usable token until it expires, which is the
 * documented trade-off for a stateless session.
 */
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { ApiError } from './error.js';

/** Token lifetime, per the contract. */
export const AUTH_TOKEN_TTL = '12h';

/** Every role the system knows about. */
export const ROLES = Object.freeze(['ADMIN', 'AUTHORITY', 'GUARD']);

/**
 * Signs a session token for a user row.
 * @param {{ id: number|string, role: string, name: string, email: string }} user
 * @returns {string}
 */
export function signAuthToken(user) {
  if (!user || user.id === undefined || user.id === null) {
    throw new Error('signAuthToken(user): user.id is required');
  }
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      name: user.name,
      email: user.email,
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: AUTH_TOKEN_TTL },
  );
}

/**
 * Verifies a session token.
 * @param {string} token
 * @returns {{ sub: string, role: string, name: string, email: string, iat: number, exp: number }}
 * @throws {ApiError} 401 when the token is missing, malformed or expired
 */
export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') {
    throw ApiError.unauthorized('Authentication required.');
  }
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('Invalid authentication token.');
  }
}

/** Reads the bearer token out of the Authorization header. */
function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Shapes a verified payload into `req.user`. */
function toRequestUser(payload) {
  const id = Number(payload.sub);
  if (!Number.isInteger(id) || id <= 0) {
    throw ApiError.unauthorized('Invalid authentication token.');
  }
  return { id, role: payload.role, name: payload.name, email: payload.email };
}

/**
 * Requires a valid bearer token; sets `req.user = { id, role, name, email }`.
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, res, next) {
  try {
    const payload = verifyAuthToken(bearerToken(req));
    req.user = toRequestUser(payload);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires `req.user.role` to be one of `roles`. Use after {@link requireAuth}.
 * @param {...(string|string[])} roles
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...roles) {
  const allowed = roles.flat().filter(Boolean);
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required.'));
      return;
    }
    if (allowed.length > 0 && !allowed.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have access to this resource.'));
      return;
    }
    next();
  };
}

/**
 * Attaches `req.user` when a valid token is present, and never rejects.
 * @type {import('express').RequestHandler}
 */
export function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (token) {
    try {
      req.user = toRequestUser(jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }));
    } catch {
      req.user = undefined;
    }
  }
  next();
}

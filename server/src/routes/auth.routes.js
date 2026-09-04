/**
 * GatePass — authentication routes.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import rateLimit from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/auth.controller.js';

/** Throttled per IP *and* per email, so one account cannot be ground down. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyFn: (req) => {
    const ip = String(req.ip || '').replace(/^::ffff:/, '');
    const email = String(req.body?.email || '').toLowerCase();
    return `${ip}|${email}`;
  },
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

const router = Router();

router.post(
  '/login',
  loginLimiter,
  validate({
    email: v.email({ required: true }),
    password: v.string({ required: true, min: 1, max: 200, trim: false }),
  }),
  asyncHandler(ctrl.login)
);

router.get('/me', requireAuth, asyncHandler(ctrl.me));

router.post(
  '/change-password',
  requireAuth,
  validate({
    current_password: v.string({ required: true, min: 1, max: 200, trim: false }),
    new_password: v.string({ required: true, min: 8, max: 200, trim: false }),
  }),
  asyncHandler(ctrl.changePassword)
);

export default router;

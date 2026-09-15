/**
 * GatePass — cron-triggered sweeps, for hosts (Vercel) that can't run
 * node-cron in-process. An external scheduler hits these on a timer instead
 * of `startJobs()` running them in the background.
 *
 * Vercel's own Cron Jobs feature signs its requests with a bearer token
 * equal to CRON_SECRET (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
 * and sets `x-vercel-cron` on its calls, but WITHOUT CRON_SECRET set neither
 * check applies — so an external pinger (e.g. Render, cron-job.org) can
 * still call these with `?secret=...` as long as CRON_SECRET is configured.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../middleware/error.js';
import env from '../config/env.js';
import { runReminderSweep, runOverdueSweep } from '../jobs/reminders.js';

const router = Router();

function requireCronSecret(req, res, next) {
  if (!env.CRON_SECRET) return next();
  const header = req.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const provided = bearer || req.query.secret;
  if (provided !== env.CRON_SECRET) throw ApiError.unauthorized('Invalid or missing cron secret.');
  next();
}

router.use(requireCronSecret);

router.post('/reminders', asyncHandler(async (req, res) => {
  const result = await runReminderSweep();
  res.json(result);
}));

router.post('/overdue', asyncHandler(async (req, res) => {
  const result = await runOverdueSweep();
  res.json(result);
}));

export default router;

/**
 * GatePass — unauthenticated routes.
 *
 * The default router mounts at /api/public. The named `publicGatepassRouter`
 * mounts at /api so the contract path POST /api/gatepasses/request resolves
 * without colliding with the authenticated /api/gatepasses router.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import rateLimit from '../middleware/rateLimit.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/public.controller.js';

const requestSchema = {
  visitor_name: v.string({ required: true, min: 2, max: 120 }),
  visitor_company: v.string({ max: 120 }),
  visitor_designation: v.string({ max: 120 }),
  visitor_mobile: v.phone({ required: true }),
  visitor_whatsapp: v.phone(),
  visitor_email: v.email({ required: true }),
  authority_id: v.int({ required: true, min: 1 }),
  reason: v.string({ required: true, min: 5, max: 1000 }),
  requested_date: v.date({ required: true }),
  start_time: v.time({ required: true }),
  end_time: v.time({ required: true }),
};

const rescheduleSchema = {
  requested_date: v.date({ required: true }),
  start_time: v.time({ required: true }),
  end_time: v.time({ required: true }),
};

/** Keeps the open form from being used as a mail cannon. */
const submitLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  message: 'Too many requests from this address. Please try again in a few minutes.',
});

const router = Router();

router.get('/authorities', asyncHandler(ctrl.authorities));
router.get('/rooms', asyncHandler(ctrl.rooms));
router.get('/reschedule/:token', asyncHandler(ctrl.getReschedule));
router.post(
  '/reschedule/:token',
  submitLimiter,
  validate(rescheduleSchema),
  asyncHandler(ctrl.submitReschedule)
);

/** Mounted at /api — serves the contract path /api/gatepasses/request. */
export const publicGatepassRouter = Router();
publicGatepassRouter.get('/health', asyncHandler(ctrl.health));
publicGatepassRouter.post(
  '/gatepasses/request',
  submitLimiter,
  validate(requestSchema),
  asyncHandler(ctrl.createRequest)
);
// Unauthenticated by necessity — an email client fetching an inline image
// cannot present a login session. See the qrImage() doc comment for why this
// is safe: the token is the same secret already printed in the QR itself.
publicGatepassRouter.get('/gatepasses/:id/qr.png', asyncHandler(ctrl.qrImage));

export default router;

/**
 * GatePass — authenticated gatepass routes (AUTHORITY + ADMIN).
 *
 * The public POST /api/gatepasses/request lives in public.routes.js; it must not
 * be defined here or it would inherit this router's auth guard.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/gatepass.controller.js';

const listQuery = {
  status: v.enum(['PENDING', 'APPROVED', 'REJECTED', 'RESCHEDULE_REQUESTED', 'CANCELLED']),
  date: v.date(),
  from: v.date(),
  to: v.date(),
  q: v.string({ max: 120 }),
  room_id: v.int({ min: 1 }),
  authority_id: v.int({ min: 1 }),
  page: v.int({ min: 1 }),
  pageSize: v.int({ min: 1, max: 100 }),
  sort: v.enum(['created_desc', 'created_asc', 'date_asc', 'date_desc']),
};

const router = Router();

router.use(requireAuth, requireRole('AUTHORITY', 'ADMIN'));

// Static segments first, so '/stats/summary' is not swallowed by '/:id'.
router.get('/stats/summary', asyncHandler(ctrl.stats));
router.get('/', validate(listQuery, 'query'), asyncHandler(ctrl.list));
router.get('/:id', asyncHandler(ctrl.getOne));

router.post(
  '/:id/approve',
  validate({ room_id: v.int({ required: true, min: 1 }), comment: v.string({ max: 1000 }) }),
  asyncHandler(ctrl.approve)
);
router.post(
  '/:id/reject',
  validate({ comment: v.string({ required: true, min: 3, max: 1000 }) }),
  asyncHandler(ctrl.reject)
);
router.post(
  '/:id/reschedule',
  validate({
    comment: v.string({ required: true, min: 3, max: 1000 }),
    suggested_date: v.date(),
    suggested_start: v.time(),
    suggested_end: v.time(),
  }),
  asyncHandler(ctrl.requestReschedule)
);
router.post(
  '/:id/comment',
  validate({ comment: v.string({ required: true, min: 1, max: 1000 }) }),
  asyncHandler(ctrl.addComment)
);
router.post(
  '/:id/switch-room',
  validate({ room_id: v.int({ required: true, min: 1 }) }),
  asyncHandler(ctrl.switchRoom)
);
router.post('/:id/close-early', asyncHandler(ctrl.closeEarly));
router.post('/:id/resend-email', asyncHandler(ctrl.resendEmail));

export default router;

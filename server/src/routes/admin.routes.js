/**
 * GatePass — administrator routes. ADMIN only, enforced for the whole router.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/admin.controller.js';

const ROLE_VALUES = ['ADMIN', 'AUTHORITY', 'GUARD'];

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get(
  '/users',
  validate(
    {
      role: v.enum(ROLE_VALUES),
      q: v.string({ max: 120 }),
      active: v.bool(),
      page: v.int({ min: 1 }),
      pageSize: v.int({ min: 1, max: 100 }),
    },
    'query'
  ),
  asyncHandler(ctrl.listUsers)
);

router.post(
  '/users',
  validate({
    name: v.string({ required: true, min: 2, max: 120 }),
    email: v.email({ required: true }),
    password: v.string({ required: true, min: 8, max: 200, trim: false }),
    role: v.enum(ROLE_VALUES, { required: true }),
    mobile: v.phone(),
    department: v.string({ max: 120 }),
    designation: v.string({ max: 120 }),
    send_invite: v.bool(),
  }),
  asyncHandler(ctrl.createUser)
);

router.put(
  '/users/:id',
  validate({
    name: v.string({ min: 2, max: 120 }),
    email: v.email(),
    password: v.string({ min: 8, max: 200, trim: false }),
    role: v.enum(ROLE_VALUES),
    mobile: v.phone(),
    department: v.string({ max: 120 }),
    designation: v.string({ max: 120 }),
    is_active: v.bool(),
  }),
  asyncHandler(ctrl.updateUser)
);

router.delete('/users/:id', asyncHandler(ctrl.deleteUser));

router.get('/overview', asyncHandler(ctrl.overview));
router.get('/gatepasses', asyncHandler(ctrl.gatepasses));
router.get('/meeting-logs', asyncHandler(ctrl.meetingLogs));
router.get('/activity', asyncHandler(ctrl.activity));

export default router;

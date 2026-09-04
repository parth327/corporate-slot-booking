/**
 * GatePass — meeting room routes.
 * Readable by any signed-in role; only ADMIN may change the catalogue.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/room.controller.js';

const roomBody = {
  name: v.string({ min: 1, max: 120 }),
  building: v.string({ max: 120 }),
  floor: v.string({ max: 40 }),
  capacity: v.int({ min: 0, max: 10000 }),
  amenities: v.string({ max: 500 }),
  is_active: v.bool(),
};

const router = Router();

router.use(requireAuth);

// Static paths before parameterised ones.
router.get(
  '/availability',
  validate(
    {
      date: v.date({ required: true }),
      start_time: v.time({ required: true }),
      end_time: v.time({ required: true }),
      exclude_gatepass_id: v.int({ min: 1 }),
    },
    'query'
  ),
  asyncHandler(ctrl.availability)
);

router.get('/', validate({ active: v.bool() }, 'query'), asyncHandler(ctrl.list));
router.get('/schedule', validate({ date: v.date() }, 'query'), asyncHandler(ctrl.scheduleAll));
router.get('/:id/schedule', validate({ date: v.date() }, 'query'), asyncHandler(ctrl.schedule));

router.post(
  '/',
  requireRole('ADMIN'),
  validate({ ...roomBody, name: v.string({ required: true, min: 1, max: 120 }) }),
  asyncHandler(ctrl.create)
);
router.put('/:id', requireRole('ADMIN'), validate(roomBody), asyncHandler(ctrl.update));
router.delete('/:id', requireRole('ADMIN'), asyncHandler(ctrl.remove));

export default router;

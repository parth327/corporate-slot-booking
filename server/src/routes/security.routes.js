/**
 * GatePass — security desk routes. GUARD and ADMIN only.
 */
import { Router } from 'express';
import asyncHandler from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, v } from '../middleware/validate.js';
import * as ctrl from '../controllers/security.controller.js';

const router = Router();

router.use(requireAuth, requireRole('GUARD', 'ADMIN'));

// Static paths first so '/search' and '/today' are not read as ids.
router.get('/search', asyncHandler(ctrl.search));
router.get('/today', asyncHandler(ctrl.today));
router.get('/history', asyncHandler(ctrl.history));

router.post(
  '/verify',
  validate({
    token: v.string({ max: 2000 }),
    short_code: v.string({ max: 16 }),
  }),
  asyncHandler(ctrl.verify)
);

router.get('/gatepass/:id', asyncHandler(ctrl.getOne));
router.post('/gatepass/:id/check-in', asyncHandler(ctrl.checkIn));
router.post('/gatepass/:id/check-out', asyncHandler(ctrl.checkOut));

export default router;

import express from 'express';
import {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  validateCoupon
} from '../controllers/couponController.js';

import { requireRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin routes
router.get('/', verifyToken, requireRole(['admin', 'subadmin']), getAllCoupons);
router.get('/:id', verifyToken, requireRole(['admin', 'subadmin']), getCouponById);
router.post('/', verifyToken, requireRole(['admin', 'subadmin']), createCoupon);
router.put('/:id', verifyToken, requireRole(['admin', 'subadmin']), updateCoupon);
router.delete('/:id', verifyToken, requireRole('admin'), deleteCoupon);
router.patch('/toggle/:id', verifyToken, requireRole(['admin','subadmin']), toggleCouponStatus);

// User route - validate coupon during checkout
router.post('/validate', verifyToken, requireRole('user'), validateCoupon);

export default router;
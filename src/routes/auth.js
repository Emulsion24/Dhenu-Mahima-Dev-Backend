import express from 'express';
import { 
  signup,
  verifyOtp,
  login,
  logout,
  forgotPassword,
  resetPassword,
  checkAuth
} from '../controllers/authController.js';
import { verifyToken,requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/logout', logout);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/check-auth',checkAuth);


router.get('/admin', verifyToken, requireRole("admin"), (req, res) => res.json({ message: 'Welcome Admin' }));

export default router;

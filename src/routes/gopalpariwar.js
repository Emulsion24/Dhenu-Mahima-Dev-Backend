// routes/gopalPariwar.routes.js
import express from 'express';
import upload from '../middleware/multerMiddleware.js';
import {
  createGopal,
  getAllGopal,
  getGopalById,
  updateGopal,
  deleteGopal
} from '../controllers/gopalPawriwarController.js';
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
// Adjust path as needed

const router = express.Router();

// Public route - Get all Gopal Pariwar data
router.get('/', getAllGopal);

// Public route - Get single Gopal Pariwar by ID
router.get('/:id', getGopalById);

// Protected routes - Require authentication and admin role
router.post('/create',upload.single("photo"), verifyToken, requireRole("admin"), createGopal);
router.put('/update/:id',upload.single("photo"), verifyToken, requireRole("admin"), updateGopal);
router.delete('/delete/:id', verifyToken, requireRole("admin"), deleteGopal);

export default router;
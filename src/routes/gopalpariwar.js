// routes/gopalPariwar.routes.js
import express from 'express';
import {uploadImage} from '../middleware/multerMiddleware.js';
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
router.post('/create',uploadImage.single("photo"), verifyToken, requireRole(["admin", "subadmin"]), createGopal);
router.put('/update/:id',uploadImage.single("photo"), verifyToken, requireRole(["admin", "subadmin"]), updateGopal);
router.delete('/delete/:id', verifyToken, requireRole("admin"), deleteGopal);

export default router;
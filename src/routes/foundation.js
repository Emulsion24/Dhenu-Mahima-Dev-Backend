// foundationRoutes.js
import express from 'express';
import {
  getAllFoundations,
  getFoundationById,
  createFoundation,
  updateFoundation,
  deleteFoundation,
} from '../controllers/foundationController.js';
import{uploadImage}from "../middleware/multerMiddleware.js";
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
// Your auth middleware

const router = express.Router();

// Public routes
router.get('/all', getAllFoundations); // GET /api/foundations
router.get('/:id', getFoundationById); // GET /api/foundations/:id

// Protected routes (requires authentication)
router.post('/create',uploadImage.single("logo"),verifyToken,requireRole(["admin", "subadmin"]), createFoundation); // POST /api/foundations
router.put('/update/:id',uploadImage.single("logo"),verifyToken,requireRole(["admin", "subadmin"]), updateFoundation); // PUT /api/foundations/:id
router.delete('/delete/:id', verifyToken,requireRole("admin"), deleteFoundation); // DELETE /api/foundations/:id

export default router;

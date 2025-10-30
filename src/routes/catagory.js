import express from 'express';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/catagory.js';
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', getAllCategories);
router.get('/:id',getCategoryById);
router.post('/',verifyToken,requireRole(["admin", "subadmin"]), createCategory);
router.put('/:id',verifyToken,requireRole(["admin", "subadmin"]), updateCategory);
router.delete('/:id',verifyToken,requireRole("admin") ,deleteCategory);

export default router;
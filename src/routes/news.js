import express from 'express';
import { body } from 'express-validator';
import {
  getAllNews,
  getNewsById,
  getNewsBySlug,
  createNews,
  updateNews,
  deleteNews,
  getRelatedNews,
  getCategories
} from '../controllers/newsController.js';
import { upload } from '../middleware/upload.js';
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Validation middleware
const newsValidation = [
  body('title').notEmpty().withMessage('Title is required'),
  body('titleEn').notEmpty().withMessage('English title is required'),
  body('excerpt').notEmpty().withMessage('Excerpt is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('readTime').notEmpty().withMessage('Read time is required')
];

// Routes
router.get('/', getAllNews);
router.get('/categories', getCategories);
router.get('/:id', getNewsById);
router.get('/slug/:slug', getNewsBySlug);
router.get('/related/:id', getRelatedNews);
router.post('/',verifyToken,requireRole(["admin", "subadmin"]),upload.single('image'), newsValidation, createNews);
router.put('/:id',verifyToken,requireRole(["admin", "subadmin"]), upload.single('image'), updateNews);
router.delete('/:id', verifyToken,requireRole("admin"),deleteNews);

export default router;
import express from 'express';
import {
  getAllBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  streamPdf,
  downloadPdf
} from '../controllers/booksController.js';
import { verifyToken, requireRole} from '../middleware/authMiddleware.js';

import {upload} from '../middleware/upload.js';

const router = express.Router();

// Public routes
router.get('/', getAllBooks);
router.get('/:id', getBookById);

// Protected routes - Admin only
router.post('/', verifyToken, requireRole('admin', 'subadmin'), upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "image", maxCount: 1 }
]), createBook);
router.put('/:id', verifyToken, requireRole('admin', 'subadmin'), upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "image", maxCount: 1 }
]), updateBook);
router.delete('/:id', verifyToken, requireRole('admin', 'subadmin'), deleteBook);

// Protected route - Stream PDF (only for purchased users)
router.get('/:id/stream', verifyToken, requireRole('user'), streamPdf);
router.get('/pdf/download/:filename',verifyToken,requireRole("admin"),downloadPdf);

export default router;
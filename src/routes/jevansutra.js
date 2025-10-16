import express from 'express';
import {
  getAllBhajans,
  getBhajanById,
  createBhajan,
  updateBhajan,
  deleteBhajan,
  streamAudio,
  downloadAudio,
  searchBhajans,
} from '../controllers/jevansutraController.js';

import {upload} from '../middleware/upload.js';
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 📌 CRUD Routes
router.get('/', getAllBhajans);
router.get('/:id', getBhajanById);
router.post('/',verifyToken,requireRole("admin"),upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),createBhajan);

router.put( '/:id',verifyToken,requireRole("admin"),upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),updateBhajan);

router.delete('/:id', verifyToken,requireRole("admin"),deleteBhajan);

// 📌 Streaming & Download
router.get('/audio/stream/:filename', streamAudio);
router.get('/audio/download/:filename',verifyToken,requireRole("admin"), downloadAudio);

// 📌 Search
router.get('/search', searchBhajans);

export default router;

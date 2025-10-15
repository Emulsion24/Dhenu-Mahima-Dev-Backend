import express from 'express';

import upload from "../middleware/multerMiddleware.js";
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { createSansthan, deleteSansthan, getAllSansthans, getSansthanById, updateSansthan } from '../controllers/datasSangsthan.js';

const router = express.Router();

router.get('/',getAllSansthans);
router.get('/:id',getSansthanById);
router.post('/',upload.single("photo"),verifyToken,requireRole("admin"),createSansthan);
router.put('/:id',upload.single("photo"),verifyToken,requireRole("admin"),updateSansthan);
router.delete('/:id', deleteSansthan);

export default router;

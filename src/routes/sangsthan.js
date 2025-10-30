import express from 'express';

import {uploadImage} from "../middleware/multerMiddleware.js";
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { createSansthan, deleteSansthan, getAllSansthans, getSansthanById, updateSansthan } from '../controllers/datasSangsthan.js';

const router = express.Router();

router.get('/',getAllSansthans);
router.get('/:id',getSansthanById);
router.post('/',uploadImage.single("photo"),verifyToken,requireRole(["admin", "subadmin"]),createSansthan);
router.put('/:id',uploadImage.single("photo"),verifyToken,requireRole(["admin", "subadmin"]),updateSansthan);
router.delete('/:id',verifyToken,requireRole("admin"), deleteSansthan);

export default router;

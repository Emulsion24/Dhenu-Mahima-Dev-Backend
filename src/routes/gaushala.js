import express from 'express';

import upload from "../middleware/multerMiddleware.js";
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { createGaushala, deleteGaushala, getAllGaushalas, getGaushalaById, getStatistics, searchGaushalas, updateGaushala } from '../controllers/gaushalaController.js';
const router = express.Router();

router.get('/statistics',getStatistics);
router.get('/search',searchGaushalas);

router.get('/',getAllGaushalas);
router.get('/:id',getGaushalaById);
router.post('/',upload.single("photo"),verifyToken,requireRole("admin"),createGaushala );
router.put('/:id',upload.single("photo"),verifyToken,requireRole("admin"),updateGaushala);
router.delete('/:id', deleteGaushala);

export default router;

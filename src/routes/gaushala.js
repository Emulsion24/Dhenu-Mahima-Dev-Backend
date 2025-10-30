import express from 'express';

import {uploadImage}from "../middleware/multerMiddleware.js";
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { createGaushala, deleteGaushala, getAllGaushalas, getGaushalaById, getStatistics, searchGaushalas, updateGaushala } from '../controllers/gaushalaController.js';
const router = express.Router();

router.get('/statistics',getStatistics);
router.get('/search',searchGaushalas);

router.get('/',getAllGaushalas);
router.get('/:id',getGaushalaById);
router.post('/',uploadImage.single("photo"),verifyToken,requireRole(["admin", "subadmin"]),createGaushala );
router.put('/:id',uploadImage.single("photo"),verifyToken,requireRole(["admin", "subadmin"]),updateGaushala);
router.delete('/:id', verifyToken,requireRole("admin"),deleteGaushala);

export default router;

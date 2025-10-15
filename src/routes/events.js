import express from 'express';

import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { cleanupExpiredEvents, createEvent, deleteEvent, getAllEvents, getEventById, updateEvent } from '../controllers/eventsController.js';

const router = express.Router();

router.get('/',getAllEvents);
router.get('/:id',getEventById);
router.post('/',verifyToken,requireRole("admin"),createEvent);
router.put('/:id',verifyToken,requireRole("admin"),updateEvent);
router.delete('/:id', verifyToken,requireRole("admin"),deleteEvent);
router.get('/cleanup',verifyToken,requireRole("admin"),cleanupExpiredEvents);
export default router;

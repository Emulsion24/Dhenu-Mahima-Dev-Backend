import express from 'express';

import { requireRole, verifyToken } from '../middleware/authMiddleware.js';
import { cleanupExpiredEvents, createEvent, deleteEvent, getAllEvents, getEventById, updateEvent } from '../controllers/eventsController.js';

const router = express.Router();

router.get('/',getAllEvents);
router.get('/:id',getEventById);
router.post('/',verifyToken,requireRole(["admin", "subadmin"]),createEvent);
router.put('/:id',verifyToken,requireRole(["admin", "subadmin"]),updateEvent);
router.delete('/:id', verifyToken,requireRole("admin"),deleteEvent);
router.get('/cleanup',verifyToken,requireRole(["admin", "subadmin"]),cleanupExpiredEvents);
export default router;

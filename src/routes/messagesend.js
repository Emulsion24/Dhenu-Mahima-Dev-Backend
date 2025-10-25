import express from 'express';
import { sendMessage } from '../controllers/messageController.js';

const router = express.Router();

// POST /api/send-message
router.post('/send-message', sendMessage);

export default router;
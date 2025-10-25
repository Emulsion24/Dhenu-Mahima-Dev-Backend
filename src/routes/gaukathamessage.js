import express from 'express';

import { submitGauKathaBooking } from '../controllers/gauKathaMessage.js';

const router = express.Router();

// POST /api/send-message
router.post('/message',submitGauKathaBooking) ;

export default router;
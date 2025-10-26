// routes/paymentRoutes.js
import express from 'express';
import {
  createOrder,
  paymentCallback,
  phonePeWebhook,
  checkPaymentStatus,

  getPurchasedBooks,

} from '../controllers/pdfBookPaymentController.js';
import { requireRole, verifyToken } from '../middleware/authMiddleware.js';


const router = express.Router();


router.post('/create-order',verifyToken,requireRole("user") ,createOrder);

router.get('/callback', paymentCallback);


router.post('/webhook', phonePeWebhook);


router.get('/status/:transactionId',verifyToken,requireRole("user"), checkPaymentStatus);




router.get('/books/purchased/:userId',verifyToken,requireRole("user"), getPurchasedBooks);




export default router;
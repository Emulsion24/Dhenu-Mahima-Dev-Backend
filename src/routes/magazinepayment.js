import express from "express";
import { verifyToken, requireRole, optionalAuth } from "../middleware/authMiddleware.js";
import { checkPaymentStatus, createSubscriptionSetup, getSubscriptionOrderStatus, initiateOneTimePayment, validateUpiVpa } from "../controllers/magazinePaymentController.js";



const router = express.Router();


router.post("/create-order",optionalAuth,createSubscriptionSetup);
router.post("/create-order-onetime",optionalAuth,initiateOneTimePayment);

router.post("/order-status/:merchantOrderId",optionalAuth,getSubscriptionOrderStatus);
router.post("/order-status-onetime/:merchantOrderId",optionalAuth,checkPaymentStatus);
router.post("/validate-vpa",optionalAuth,validateUpiVpa);


export default router;
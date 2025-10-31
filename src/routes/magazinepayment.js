import express from "express";
import { verifyToken, requireRole, optionalAuth } from "../middleware/authMiddleware.js";
import { cancelSubscription, checkPaymentStatus, createSubscriptionSetup, deleteSubscription, getAllPayments, getSubscriptionOrderStatus,  initiateOneTimePayment, validateUpiVpa } from "../controllers/magazinePaymentController.js";



const router = express.Router();


router.post("/create-order",optionalAuth,createSubscriptionSetup);
router.post("/create-order-onetime",optionalAuth,initiateOneTimePayment);

router.post("/order-status/:merchantOrderId",optionalAuth,getSubscriptionOrderStatus);
router.get("/order-status-onetime",optionalAuth,checkPaymentStatus);
router.patch("/:id",verifyToken,requireRole(['admin','subadmin']),cancelSubscription);
router.get("/",verifyToken,requireRole(['admin','subadmin']),getAllPayments);
router.delete("/delete/:id",verifyToken,requireRole('admin'),deleteSubscription);

router.post("/validate-vpa",optionalAuth,validateUpiVpa);


export default router;
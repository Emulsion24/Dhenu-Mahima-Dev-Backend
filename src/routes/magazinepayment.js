import express from "express";
import { verifyToken, requireRole } from "../middleware/authMiddleware.js";

import {  checkSubscriptionOrderStatus, createSubscription, getAllSubscriptions } from "../controllers/magazinePaymentController.js";

const router = express.Router();


router.post("/create-order", verifyToken, requireRole("user"), createSubscription);




router.get("/callback/:merchantOrderId", checkSubscriptionOrderStatus);
router.get("/", verifyToken, requireRole("admin"),getAllSubscriptions);

export default router;
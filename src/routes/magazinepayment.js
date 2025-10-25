import express from "express";
import { verifyToken, requireRole } from "../middleware/authMiddleware.js";

import { createMembershipPayment, membershipPaymentCallback, phonePeMembershipWebhook } from "../controllers/magazinePaymentController.js";

const router = express.Router();


router.post("/create-order", verifyToken, requireRole("user"), createMembershipPayment);


router.post("/webhook", phonePeMembershipWebhook);


router.get("/callback", membershipPaymentCallback);

export default router;
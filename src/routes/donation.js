import express from "express";
import { verifyToken, requireRole } from "../middleware/authMiddleware.js";
import { createDonation, donationCallback, phonePeWebhook,  } from "../controllers/donationController.js";

const router = express.Router();


router.post("/create-order", verifyToken, requireRole("user"), createDonation);


router.post("/webhook", phonePeWebhook);


router.get("/callback", donationCallback);

export default router;

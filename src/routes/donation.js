import express from "express";
import { verifyToken, requireRole } from "../middleware/authMiddleware.js";
import { createDonation, donationCallback, getAllDonations, getDonationStats, phonePeWebhook,  } from "../controllers/donationController.js";

const router = express.Router();


router.post("/create-order", verifyToken, requireRole("user"), createDonation);
router.get("/",verifyToken,requireRole("admin"),getAllDonations);
router.get("/stats",verifyToken,requireRole("admin"),getDonationStats);

router.post("/webhook", phonePeWebhook);


router.get("/callback", donationCallback);

export default router;

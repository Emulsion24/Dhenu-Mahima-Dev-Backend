import express from "express";
import { verifyToken, requireRole, optionalAuth } from "../middleware/authMiddleware.js";
import { createDonation, deleteDonation, donationCallback, getAllDonations, getDonationStats, phonePeWebhook,  } from "../controllers/donationController.js";

const router = express.Router();
router.delete("/:id",verifyToken,requireRole(["admin"]),deleteDonation);

router.post("/create-order", optionalAuth, createDonation);
router.get("/",verifyToken,requireRole(["admin", "subadmin"]),getAllDonations);

router.get("/stats",verifyToken,requireRole(["admin", "subadmin"]),getDonationStats);

router.post("/webhook", phonePeWebhook);


router.get("/callback", donationCallback);

export default router;

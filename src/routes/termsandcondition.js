import express from "express";
import { 
  getPolicy,
  savePolicy, 

} from "../controllers/termsConditionController.js";
import { requireRole, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get full privacy policy
router.get("/", getPolicy);

// Create new privacy policy
router.post("/", verifyToken,requireRole("admin"),savePolicy);





export default router;

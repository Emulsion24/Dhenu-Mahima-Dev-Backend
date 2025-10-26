import express from "express";
import { getUserData } from "../controllers/userController.js";
import { requireRole, verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/:userId/data",verifyToken,requireRole("user"),getUserData);

export default router;

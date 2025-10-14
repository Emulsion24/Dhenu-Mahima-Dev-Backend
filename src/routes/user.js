// userRoutes.js
import express from "express";
import {
  getUsers,
  getUserById,
  addUser,
  updateUser,
  deleteUser,
  updateUserRole,
} from "../controllers/userController.js";
import { verifyToken, requireRole } from "../middleware/authMiddleware.js"; // Adjust path

const router = express.Router();

// All routes require authentication and admin role


// GET all users with pagination and search
router.get("/users",verifyToken,requireRole("admin"), getUsers);

// GET single user by ID
router.get("/users/:id",verifyToken,requireRole("admin"), getUserById);

// POST create new user
router.post("/users",verifyToken,requireRole("admin"), addUser);

// PUT update user
router.put("/users/:id",verifyToken,requireRole("admin"), updateUser);

// DELETE user
router.delete("/users/:id", verifyToken,requireRole("admin"),deleteUser);

// PATCH update user role only
router.patch("/users/:id/role",verifyToken,requireRole("admin"), updateUserRole);

export default router;
import express from "express";
import { verifyToken,requireRole } from "../middleware/authMiddleware.js";
import { uploadBanner ,deleteBanner, deleteDirectorMessage, addDirectorMessage, getDirectorMessage, reorderBanners} from "../controllers/adminController.js";
import upload from "../middleware/multerMiddleware.js";
import { addCard, deleteCard, editCard, getCards, reorderCards } from "../controllers/cardController.js";


const router=express.Router();
router.put("/banners/reorder",verifyToken,requireRole("admin"),reorderBanners);
router.post("/banners/upload",verifyToken, requireRole("admin"), upload.single("file"),uploadBanner);

router.post("/message/upload",verifyToken, requireRole("admin"), addDirectorMessage);
router.delete("/delete-message/:id", verifyToken, requireRole("admin"),deleteDirectorMessage);
router.delete("/delete-banner/:id", verifyToken, requireRole("admin"),deleteBanner);
router.get("/message",verifyToken, requireRole("admin"), getDirectorMessage);
router.get("/cards",verifyToken, requireRole("admin"), getCards);
router.post("/add-card",verifyToken,requireRole("admin"),addCard);
router.delete("/delete-card/:id",verifyToken,requireRole("admin"),deleteCard);
router.put("/cards/reorder",verifyToken,requireRole("admin"),reorderCards);
router.put("/edit-card/:id",verifyToken,requireRole("admin"),editCard);
router.get('/admin', verifyToken, requireRole("admin"), (req, res) => res.json({ message: 'Welcome Admin' }));
 export default router;
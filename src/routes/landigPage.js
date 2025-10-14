import express from 'express';
import { getAllGopal, getBanner, getDirectorMessage,getFoundations } from '../controllers/landingPage.js';
import { getCards } from '../controllers/cardController.js';







const router = express.Router();
router.get('/banners',getBanner);
router.get('/quote',getDirectorMessage);
router.get('/card',getCards);
router.get('/foundations',getFoundations);
router.get('/', getAllGopal);
export default router;
import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import adminRoutes from "./routes/admin.js"
import landingRoutes from "./routes/landigPage.js"
import userRoutes from "./routes/user.js"
import useFoundationRoute from "./routes/foundation.js"
import useGopalPariwarRoutes from "./routes/gopalpariwar.js"
import useGaushala from "./routes/gaushala.js"
import useSangstanRoute from "./routes/sangsthan.js"
import useEventsRoute from "./routes/events.js"
import useNewsRoute from "./routes/news.js"
import usejevansutraRoute from "./routes/jevansutra.js"
import usebooksRoute from "./routes/books.js"
import usecouponRoute from "./routes/coupon.js"
import donationRoutes from "./routes/donation.js"
import usegauMataBhajanRoute from "./routes/gaumataBhajan.js"
import GaumataCatagoryRoute from "./routes/catagory.js"

import { errorHandler } from './middleware/errorHandler.js';
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ CORS Configuration - MUST BE BEFORE OTHER MIDDLEWARE
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept'],
  exposedHeaders: ['Content-Range', 'Content-Length', 'Accept-Ranges']
}));

// ✅ Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Helmet with modified CSP for audio/video streaming
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // 🔥 Important for audio streaming
  contentSecurityPolicy: false // Disable CSP or configure it properly
}));

// 👇 Serve static uploads folder with CORS
app.use("/uploads", cors(), express.static(path.join(__dirname, "uploads")));
app.use(express.urlencoded({ extended: true }));
// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many requests, please try again later'
});
app.use('/api/auth/signup', limiter);
app.use('/api/auth/verify-otp', limiter);
app.use('/api/auth/forgot-password', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api", landingRoutes);
app.use("/api/admin", userRoutes);
app.use("/api/admin/foundation", useFoundationRoute);
app.use("/api/admin/gopalpariwar", useGopalPariwarRoutes);
app.use('/api/gaushalas', useGaushala);
app.use('/api/sansthans', useSangstanRoute);
app.use('/api/events', useEventsRoute);
app.use('/api/news', useNewsRoute);
app.use('/api/jevansutra', usejevansutraRoute);
app.use('/api/gaumata-bhajans', usegauMataBhajanRoute);
app.use('/api/books', usebooksRoute);
app.use('/api/coupons', usecouponRoute);
app.use('/api/donations', donationRoutes);
app.use("/api/gaumata-categories",GaumataCatagoryRoute);

// Default route
app.get('/', (req, res) => res.send('🚀 API Running'));

// ❗ Error handler (last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
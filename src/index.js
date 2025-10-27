import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { errorHandler } from "./middleware/errorHandler.js";

// Import routes
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import landingRoutes from "./routes/landigPage.js";
import userRoutes from "./routes/user.js";
import useFoundationRoute from "./routes/foundation.js";
import useGopalPariwarRoutes from "./routes/gopalpariwar.js";
import useGaushala from "./routes/gaushala.js";
import useSangstanRoute from "./routes/sangsthan.js";
import useEventsRoute from "./routes/events.js";
import useNewsRoute from "./routes/news.js";
import usejevansutraRoute from "./routes/jevansutra.js";
import usebooksRoute from "./routes/books.js";
import usecouponRoute from "./routes/coupon.js";
import donationRoutes from "./routes/donation.js";
import usegauMataBhajanRoute from "./routes/gaumataBhajan.js";
import GaumataCatagoryRoute from "./routes/catagory.js";
import privacyPolicyRoutes from "./routes/privacyPolicy.js";
import messageRoute from "./routes/messagesend.js";
import gauKathamessageRoute from "./routes/gaukathamessage.js";
import termsConditionsRoutes from "./routes/termsandcondition.js";
import membershipRoutes from "./routes/magazinepayment.js";
import userdataRoutes from "./routes/userData.js";
import pdfPaymentRoutes from "./routes/pdfPayment.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// ✅ CORS CONFIGURATION (MUST BE FIRST!)
// ========================================
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://dhenu-mahima-dev.vercel.app",
      "http://localhost:3000",
      "http://i4o4s8gw4ockc44coogsgkgk.72.60.221.4.sslip.io",
      "http://g4s408kkw4cg48ccskcwc8kg.72.60.221.4.sslip.io",
    ];

    // ✅ Allow requests with no origin (Postman, mobile app, etc.)
    // ✅ Allow all Vercel preview subdomains
    if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  // ✅ Add Range + streaming headers explicitly
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cookie",
    "Range",
    "ngrok-skip-browser-warning",
    "Origin",
    "Accept",
  ],

  // ✅ Ensure browser can read streaming metadata headers
  exposedHeaders: [
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
    "Content-Type",
    "Content-Disposition", // if you want downloadable files later
  ],

  optionsSuccessStatus: 204,
  maxAge: 86400,
};


// 🔍 DEBUG: Log every request and its origin

  
// Apply CORS middleware
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.header("Accept-Ranges", "bytes");
  res.header("Access-Control-Allow-Headers", "Range, Content-Type, Authorization, Origin, Accept");
  res.header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type");
  next();
});

// ========================================
// ✅ SECURITY MIDDLEWARE
// ========================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Disable CSP for media & inline scripts
  })
);

// ========================================
// ✅ BODY PARSERS
// ========================================
app.use(express.json({ limit: "10mb" })); // Increase if you handle large payloads
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// ========================================
// ✅ RATE LIMITING
// ========================================
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { 
    success: false, 
    message: "Too many requests, please try again later." 
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

// Apply rate limiting only to sensitive routes
app.use("/api/auth/signup", limiter);
app.use("/api/auth/verify-otp", limiter);
app.use("/api/auth/forgot-password", limiter);
app.use("/api/auth/reset-password", limiter);

// ========================================
// ✅ STATIC FILES
// ========================================
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: "1d", // Cache static files for 1 day
  etag: true,
}));




// ========================================
// ✅ API ROUTES
// ========================================

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 API Running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.use("/api/auth", authRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin", userRoutes);
app.use("/api/admin/foundation", useFoundationRoute);
app.use("/api/admin/gopalpariwar", useGopalPariwarRoutes);

// Public API routes
app.use("/api", landingRoutes);
app.use("/api/users", userdataRoutes);
app.use("/api/gaushalas", useGaushala);
app.use("/api/sansthans", useSangstanRoute);
app.use("/api/events", useEventsRoute);
app.use("/api/news", useNewsRoute);
app.use("/api/jevansutra", usejevansutraRoute);
app.use("/api/gaumata-bhajans", usegauMataBhajanRoute);
app.use("/api/books", usebooksRoute);
app.use("/api/coupons", usecouponRoute);
app.use("/api/donations", donationRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/gaumata-categories", GaumataCatagoryRoute);
app.use("/api/privacy-policy", privacyPolicyRoutes);
app.use("/api/terms-conditions", termsConditionsRoutes);
app.use("/api", messageRoute);
app.use("/api/message-submit", gauKathamessageRoute);
app.use("/api/pdf-payment", pdfPaymentRoutes);

// ========================================
// ✅ 404 HANDLER
// ========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// ========================================
// ✅ ERROR HANDLER (MUST BE LAST!)
// ========================================
app.use(errorHandler);

// ========================================
// ✅ START SERVER
// ========================================
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Server Started Successfully      ║
╠════════════════════════════════════════╣
║   Port: ${PORT}                        
║   Environment: ${process.env.NODE_ENV || "development"}
║   Time: ${new Date().toLocaleString()}
╚════════════════════════════════════════╝
  `);
  
  console.log("✅ Allowed CORS Origins:");
  console.log("   - https://dhenu-mahima-dev.vercel.app");
  console.log("   - http://localhost:3000");
  console.log("   - https://saccharic-noncollusively-loni.ngrok-free.dev");
  console.log("");
});

// ========================================
// ✅ GRACEFUL SHUTDOWN
// ========================================
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM signal received: closing HTTP server");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("👋 SIGINT signal received: closing HTTP server");
  process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Promise Rejection:", err);
  // In production, you might want to exit the process
  // process.exit(1);
});

export default app;
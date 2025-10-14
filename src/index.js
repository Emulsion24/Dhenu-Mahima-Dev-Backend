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
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "",
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Too many requests, please try again later'
});
app.use('/api/auth/signup', limiter);
app.use('/api/auth/verify-otp', limiter);
app.use('/api/auth/forgot-password', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin',adminRoutes );
app.use("/api",landingRoutes);
app.use("/api/admin",userRoutes);
app.use("/api/admin/foundation",useFoundationRoute);
app.use("/api/admin/gopalpariwar",useGopalPariwarRoutes);

// Default route
app.get('/', (req, res) => res.send('🚀 API Running'));

// ❗ Error handler (last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

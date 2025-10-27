import { prisma } from '../prisma/config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {generateOtp} from "../utils/generateOtp.js"
import { sendOtpEmail, sendResetPasswordEmail } from '../services/emailService.js';

const SALT_ROUNDS = 10;

// 📝 SIGNUP
export async function signup(req, res) {
  try {
    const { name,email,phone, password,address} = req.body;
    const existing = await prisma.user.findUnique({ where: { email }});
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const otp = generateOtp();
    const expires = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.user.create({
      data: { name,email,phone,password: hash,address, role: 'user', otpCode: otp, otpExpires: expires }
    });

    await sendOtpEmail(email, otp);
    res.json({ message: 'User registered. OTP sent to email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ✅ VERIFY OTP
export async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email }});
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.json({ message: 'Already verified' });

    if (user.otpCode !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    await prisma.user.update({
      where: { email },
      data: { isVerified: true, otpCode: null, otpExpires: null }
    });

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}


// 🔑 LOGIN
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email }});
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

    if (!user.isVerified) return res.status(403).json({ message: 'Email not verified' });

    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email,name:user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set token in HttpOnly cookie
res.cookie('token', token, {
httpOnly: true,
  secure: false,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
});


    res.json({ role: user.role, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}


// 🚪 LOGOUT
export async function logout(req, res) {
  res.clearCookie('token', {
httpOnly: true,
  secure: false,
  sameSite: "lax",
  });
  res.json({ message: 'Logout successful' });
}


// 📩 FORGOT PASSWORD
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email }});
    if (!user) return res.status(404).json({ message: 'User not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { email },
      data: { resetToken: token, resetTokenExpires: expires }
    });

  const link = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`;
    await sendResetPasswordEmail(email, link);
    res.json({ message: 'Reset link sent to email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// 🔐 RESET PASSWORD
export async function resetPassword(req, res) {
  try {
    const { token } = req.body;
    
    const { newPassword } = req.body;
   
    const user = await prisma.user.findFirst({ where: { resetToken: token }});

    
    if (!user || user.resetTokenExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
      
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, resetToken: null, resetTokenExpires: null }
    });

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// 🧑 CHECK AUTH
export async function checkAuth(req, res) {

  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({
      success: true,
      user: decoded,
    });
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
}

import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { comparePasswords, generateToken, generateOtp, verifyOtp, JwtPayload } from '@/lib/auth.utils';
import { Role } from '@prisma/client';
import { LoginPayload } from '@/models/auth.types';

// For storing OTPs temporarily (in-memory, replace with Redis/DB for production)
// This is a very basic in-memory store for OTPs for demonstration.
// In a real app, consider rate limiting and more robust storage.
const otpStore: Record<string, { otp: string; expiresAt: number; attempts: number }> = {};
const OTP_EXPIRY_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_OTP_ATTEMPTS = 3;

// POST /auth/login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ message: 'Phone and password are required.' });
    }

    // Find user by phone
    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        passwordHash: true,
        role: true,
        name: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Verify password
    const isValid = await comparePasswords(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      userId: user.id,
      role: user.role
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

// POST /auth/parent-login
export const parentLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required.' });
    }

    // Find parent by phone
    const user = await prisma.user.findUnique({
      where: { phone, role: Role.PARENT },
      select: {
        id: true,
        phone: true,
        role: true,
        name: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or not a parent account.' });
    }

    // Generate OTP
    const otp = generateOtp(user.phone);

    // Store OTP with expiry and reset attempts
    otpStore[user.phone] = {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_DURATION,
      attempts: 0
    };

    // In development/test, log the OTP
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV/TEST] OTP for ${user.phone}: ${otp}`);
    }

    // In production, send OTP via SMS
    // await sendSms(user.phone, `Your OTP is: ${otp}`);

    return res.status(200).json({
      message: 'OTP sent successfully.',
      userId: user.id
    });
  } catch (error) {
    next(error);
  }
};

// POST /auth/verify-otp
export const verifyOtpAndLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required.' });
    }

    // Find parent by phone
    const user = await prisma.user.findUnique({
      where: { phone, role: Role.PARENT },
      select: {
        id: true,
        phone: true,
        role: true,
        name: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or not a parent account.' });
    }

    // Check if OTP exists and hasn't expired
    const otpData = otpStore[phone];
    if (!otpData || Date.now() > otpData.expiresAt) {
      return res.status(401).json({ message: 'Invalid or expired OTP.' });
    }

    // Check attempts
    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      delete otpStore[phone]; // Clear the OTP
      return res.status(401).json({ message: 'Too many failed attempts. Please request a new OTP.' });
    }

    // Verify OTP
    if (otpData.otp !== otp) {
      otpData.attempts++;
      return res.status(401).json({ message: 'Invalid or expired OTP.' });
    }

    // Clear OTP after successful verification
    delete otpStore[phone];

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      userId: user.id,
      role: user.role
    });

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};
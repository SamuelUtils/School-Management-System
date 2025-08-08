import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib'; // authenticator is the default TOTP instance
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const OTP_BASE_SECRET = process.env.OTP_SECRET;

if (!OTP_BASE_SECRET) {
  // console.warn('Warning: OTP_SECRET is not defined in .env. Using a default internal to otplib, or a less secure method for user-specific OTPs.');
}

export interface JwtPayload {
  id: string;
  userId: string;
  role: Role;
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePasswords = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return {
      id: decoded.id,
      userId: decoded.id, // For backward compatibility
      role: decoded.role
    };
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// --- OTP Functions ---

// This function derives a user-specific "secret" for OTP generation.
// In a production system, you would ideally generate and store a unique,
// cryptographically strong secret for each user. This is a simplification.
const getUserSpecificOtpSecret = (phone: string): string => {
  if (!OTP_BASE_SECRET) {
    // console.error("CRITICAL: OTP_BASE_SECRET is not defined for OTP generation in APP!");
    // Fallback if OTP_BASE_SECRET is not set, less secure.
    // In a real app, you'd enforce OTP_BASE_SECRET or have a robust per-user secret mechanism.
    return `fallback_secret_for_${phone}`;
  }
  // console.log('APP OTP_BASE_SECRET:', OTP_BASE_SECRET);
  // Simple combination; consider using HMAC or a stronger derivation method for production.
  return OTP_BASE_SECRET + phone;
};

const configureAuthenticator = () => {
  // Set options on the global authenticator instance before   use
  authenticator.options = {
    step: Number(process.env.OTP_STEP) || 300, // 5 minutes
    window: Number(process.env.OTP_WINDOW) || 1, // Allow 1 window   before and after
    // digits: 6, // default
    // algorithm: 'sha1' // default
  };
}

export const generateOtp = (phone: string): string => {
  configureAuthenticator(); // Ensure options are set
  const userSecret = getUserSpecificOtpSecret(phone);
  return authenticator.generate(userSecret);
};

export const verifyOtp = (tokenToVerify: string, phone: string): boolean => {
  configureAuthenticator(); // Ensure options are set
  // console.log('APP Authenticator options for check:', JSON.stringify(authenticator.options)); 
  const userSecret = getUserSpecificOtpSecret(phone);
  try {
    // authenticator.check will use the options set on authenticator.options
    return authenticator.check(tokenToVerify, userSecret);
  } catch (error) {
    // otplib might throw an error for invalid tokens or other issues
    console.error("OTP verification error (otplib):", error);
    return false;
  }
};
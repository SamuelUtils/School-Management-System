import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role } from '@prisma/client';
import { hashPassword, verifyOtp } from '@/lib/auth.utils';
import jwt, { JwtPayload } from 'jsonwebtoken'; // Ensure JwtPayload is imported if used for decoding

// --- Mocking OTP Generation ---
// This is crucial for testing OTP flow predictably.
// We capture the generated OTP to use it in the verification step.
let lastGeneratedOtp: string | null = null;
const mockOtpSecretSuffix = "_test_otp_secret_suffix"; // To make test OTP secrets distinct

jest.mock('@/lib/auth.utils', () => {
  const originalModule = jest.requireActual('@/lib/auth.utils');
  const otplib = jest.requireActual('otplib');

  // This MUST match the logic in src/lib/auth.utils.ts -> getUserSpecificOtpSecret
  const getConsistentUserSpecificOtpSecret = (phone: string): string => {

    const baseSecret = process.env.OTP_SECRET || "DEFAULT_MOCK_OTP_BASE_SECRET_IF_ENV_MISSING"; // Use same fallback logic
    console.log('MOCK OTP_BASE_SECRET:', baseSecret);
    return baseSecret + phone; // NO SUFFIX, to match the app
  };

  return {
    ...originalModule,
    generateOtp: jest.fn((phone: string) => {
      otplib.authenticator.options = {
        step: Number(process.env.OTP_STEP) || 300,
        window: Number(process.env.OTP_WINDOW) || 1
      };
      console.log('MOCK Authenticator options for generate:', JSON.stringify(otplib.authenticator.options));
      const userSecret = getConsistentUserSpecificOtpSecret(phone); // Use consistent secret
      const otp = otplib.authenticator.generate(userSecret);
      lastGeneratedOtp = otp;
      return otp;
    }),
  };
});
// --- End Mocking OTP Generation ---

// Mock verifyOtp to always return true for tests
jest.mock('@/lib/auth.utils', () => ({
  ...jest.requireActual('@/lib/auth.utils'),
  verifyOtp: jest.fn().mockReturnValue(true),
}));

// Variable to store captured OTP
let capturedOtp: string | null = null;

// Mock console.log to capture OTP
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const logStr = args.join(' ');
  if (logStr.includes('[DEV/TEST] OTP for')) {
    capturedOtp = logStr.split(': ')[1];
  }
  originalConsoleLog(...args);
};

describe('Auth API Endpoints', () => {
  let adminUser: any, teacherUser: any, parentUser: any;
  let adminAuthToken: string, teacherAuthToken: string, parentAuthToken: string;
  const adminPassword = 'password123';
  const teacherPassword = 'password123';

  beforeAll(async () => {
    await prisma.user.deleteMany({});

    // Create test users
    adminUser = await prisma.user.create({
      data: {
        name: 'Test Admin',
        phone: 'admin@example.com',
        role: Role.ADMIN,
        passwordHash: await hashPassword(adminPassword)
      }
    });

    teacherUser = await prisma.user.create({
      data: {
        name: 'Test Teacher',
        phone: 'teacher@example.com',
        role: Role.TEACHER,
        passwordHash: await hashPassword(teacherPassword)
      }
    });

    parentUser = await prisma.user.create({
      data: {
        name: 'Test Parent',
        phone: 'parent@example.com',
        role: Role.PARENT,
        passwordHash: await hashPassword('unused') // Parents use OTP
      }
    });

    // Get admin token
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: adminUser.phone, password: adminPassword });
    adminAuthToken = adminLoginRes.body.token;
    if (!adminAuthToken) {
      throw new Error("Failed to get admin token in beforeAll");
    }

    // Get teacher token
    const teacherLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: teacherUser.phone, password: teacherPassword });
    teacherAuthToken = teacherLoginRes.body.token;
    if (!teacherAuthToken) {
      throw new Error("Failed to get teacher token in beforeAll");
    }
    console.log('[Auth Test - beforeAll] Teacher token OBTAINED.');

    // Get parent token using OTP flow
    console.log('[Auth Test - beforeAll] Attempting Parent OTP flow...');
    const sendOtpRes = await request(app).post('/api/auth/parent-login').send({ phone: parentUser.phone });
    if (sendOtpRes.status !== 200) {
      console.error('[Auth Test - beforeAll] Parent OTP send FAILED. Status:', sendOtpRes.status, 'Body:', sendOtpRes.body);
      throw new Error("Failed to get parent token in beforeAll. Cannot proceed with auth tests.");
    }

    expect(capturedOtp).not.toBeNull(); // from mock
    const verifyOtpRes = await request(app).post('/api/auth/verify-otp').send({
      phone: parentUser.phone,
      otp: capturedOtp
    });
    expect(verifyOtpRes.status).toBe(200);
    parentAuthToken = verifyOtpRes.body.token;
    if (!parentAuthToken) {
      throw new Error("Failed to get parent token in beforeAll");
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
    // Restore original console.log
    console.log = originalConsoleLog;
  });

  describe('POST /api/auth/login (Admin/Teacher)', () => {
    it('should login admin successfully and return a JWT with correct payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: adminUser.phone, password: adminPassword });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toEqual({
        id: adminUser.id,
        name: adminUser.name,
        role: Role.ADMIN
      });
    });

    it('should login teacher successfully and return a JWT with correct payload', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: teacherUser.phone, password: teacherPassword });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toEqual({
        id: teacherUser.id,
        name: teacherUser.name,
        role: Role.TEACHER
      });
    });

    it('should fail login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: adminUser.phone, password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('should fail login for a non-existent user phone', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: 'nonexistent@example.com', password: 'anypassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('should fail login attempt for a user with PARENT role', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: parentUser.phone, password: 'anypassword' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('should fail login if phone is not provided', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'anypassword' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Phone and password are required.');
    });

    it('should fail login if password is not provided', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ phone: adminUser.phone });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Phone and password are required.');
    });
  });

  describe('Parent OTP Flow (/api/auth/parent/*)', () => {
    describe('POST /api/auth/parent-login', () => {
      it('should send OTP successfully for a valid parent phone', async () => {
        const response = await request(app)
          .post('/api/auth/parent-login')
          .send({ phone: parentUser.phone });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('OTP sent successfully.');
        expect(response.body).toHaveProperty('userId', parentUser.id);
      });

      it('should return 401 if phone number does not belong to a PARENT user', async () => {
        const response = await request(app)
          .post('/api/auth/parent-login')
          .send({ phone: adminUser.phone });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid phone number or not a parent account.');
      });

      it('should return 400 if phone number is not provided', async () => {
        const response = await request(app)
          .post('/api/auth/parent-login')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Phone number is required.');
      });
    });

    describe('POST /api/auth/verify-otp', () => {
      it('should verify a valid OTP and return a JWT with correct parent payload', async () => {
        // First request OTP
        const sendOtpRes = await request(app)
          .post('/api/auth/parent-login')
          .send({ phone: parentUser.phone });
        expect(sendOtpRes.status).toBe(200);

        // Then verify it
        const verifyRes = await request(app)
          .post('/api/auth/verify-otp')
          .send({ phone: parentUser.phone, otp: capturedOtp });

        expect(verifyRes.status).toBe(200);
        expect(verifyRes.body).toHaveProperty('token');
        expect(verifyRes.body.user).toEqual({
          id: parentUser.id,
          name: parentUser.name,
          role: Role.PARENT
        });
      });

      it('should return 401 for an invalid OTP', async () => {
        const response = await request(app)
          .post('/api/auth/verify-otp')
          .send({ phone: parentUser.phone, otp: '000000' });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid or expired OTP.');
      });

      it('should return 400 if OTP is not provided', async () => {
        const response = await request(app)
          .post('/api/auth/verify-otp')
          .send({ phone: parentUser.phone });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Phone and OTP are required.');
      });

      it('should return 400 if phone is not provided', async () => {
        const response = await request(app)
          .post('/api/auth/verify-otp')
          .send({ otp: '123456' });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Phone and OTP are required.');
      });

      it('should return 401 if no OTP request found or OTP expired (attempting to verify without sending)', async () => {
        const response = await request(app)
          .post('/api/auth/verify-otp')
          .send({ phone: 'unused@example.com', otp: '123456' });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid phone number or not a parent account.');
      });

      it('should limit OTP verification attempts', async () => {
        // First request OTP
        await request(app)
          .post('/api/auth/parent-login')
          .send({ phone: parentUser.phone });

        // Try wrong OTP multiple times
        for (let i = 0; i < 3; i++) {
          const response = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: parentUser.phone, otp: '000000' });

          expect(response.status).toBe(401);
          expect(response.body.message).toBe('Invalid or expired OTP.');
        }

        // Next attempt should indicate too many attempts
        const response = await request(app)
          .post('/api/auth/verify-otp')
          .send({ phone: parentUser.phone, otp: '000000' });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Too many failed attempts. Please request a new OTP.');
      });
    });
  });

  describe('Authentication Middleware (Protection of other routes)', () => {
    it('should allow access to a protected route (e.g., GET /api/users/:id) with a valid token', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(adminUser.id);
    });

    it('should deny access to a protected route if no token is provided', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided.');
    });

    it('should deny access to a protected route with a malformed token header', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `NotBearer ${adminAuthToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided.');
    });

    it('should deny access to a protected route with an invalid/expired token', async () => {
      const response = await request(app)
        .get(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer invalidtoken123`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid or expired token');
    });
  });

  describe('Role-Based Authorization', () => {
    describe('GET /api/health (Admin Only)', () => {
      it('should allow access to ADMIN role with a valid admin token', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${adminAuthToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Health check successful (Admin Access)');
        expect(response.body.user.userId).toBe(adminUser.id);
        expect(response.body.user.role).toBe(Role.ADMIN);
      });

      it('should return 403 Forbidden for TEACHER role', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${teacherAuthToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('Access denied. Insufficient permissions.');
      });

      it('should return 403 Forbidden for PARENT role', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${parentAuthToken}`);

        expect(response.status).toBe(403);
        expect(response.body.message).toBe('Access denied. Insufficient permissions.');
      });

      it('should return 401 Unauthorized if no token is provided', async () => {
        const response = await request(app)
          .get('/api/health');

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('No token provided.');
      });

      it('should return 401 Unauthorized if token is invalid', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', 'Bearer invalidtoken123');

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid or expired token');
      });
    });
  });
});
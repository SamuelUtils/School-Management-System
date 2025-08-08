// Load environment variables first
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

// Set required environment variables for tests if not already set
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.OTP_SECRET = process.env.OTP_SECRET || 'test-otp-secret-key';

console.log('TEST_DATABASE_URL:', process.env.DATABASE_URL);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not Set');

import prisma from '@/lib/prisma';

beforeAll(async () => {
  console.log('Attempting to connect to test database...');
  try {
    // A simple query to test connection
    await prisma.$connect(); // Explicitly connect
    await prisma.user.count(); // Try a benign query
    console.log('Successfully connected to test database and queried.');
  } catch (error) {
    console.error('Failed to connect or query test database in beforeAll:', error);
    // Optionally throw the error to fail tests early if connection is the issue
    // throw error;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  console.log('Prisma client disconnected after tests.');
});
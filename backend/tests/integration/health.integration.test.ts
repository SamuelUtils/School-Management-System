import request from 'supertest';
import { app } from '@/app'; // Your Express app
import prisma from '@/lib/prisma';
import { Role } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';

describe('GET /api/health', () => {
  let adminToken: string;

  beforeAll(async () => {
    // Create admin user and get token
    const adminUser = await prisma.user.create({
      data: {
        name: 'Health Admin',
        phone: 'health_admin@example.com',
        role: Role.ADMIN,
        passwordHash: await hashPassword('pass')
      }
    });
    const loginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: 'pass' });
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({});
  });

  it('should return 200 OK with status UP', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'UP');
    expect(response.body).toHaveProperty('timestamp');
  });
});

describe('404 Not Found Handler', () => {
  it('should return 404 for a non-existent route', async () => {
    const response = await request(app).get('/api/non-existent-route');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Resource not found' });
  });
});
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils'; // Ensure this utility is available and working

describe('User API Endpoints', () => {
  let adminUser: any; // Using 'any' for simplicity in test setup; consider stronger typing
  const adminPassword = 'TestAdminPassword123!';
  let adminAuthToken: string;

  let teacherForGetTest: any;

  beforeAll(async () => {
    // Clear database before running any tests in this suite
    await prisma.user.deleteMany({});

    // 1. Create an Admin User for authentication and general testing
    const hashedAdminPassword = await hashPassword(adminPassword);
    adminUser = await prisma.user.create({
      data: {
        name: 'Suite Admin User',
        phone: '0000000000', // Ensure this phone is unique for the suite admin
        role: Role.ADMIN,
        passwordHash: hashedAdminPassword,
      },
    });

    // 2. Log in as the Admin User to get an authentication token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ phone: adminUser.phone, password: adminPassword });

    // -------- ADD DETAILED LOGGING HERE --------
    console.log('LOGIN RESPONSE STATUS (user.integration.test.ts):', loginResponse.status);
    console.log('LOGIN RESPONSE BODY (user.integration.test.ts):', JSON.stringify(loginResponse.body, null, 2));

    if (loginResponse.status !== 200 || !loginResponse.body.token) {
      console.error('Admin login failed in beforeAll:', loginResponse.body);
      throw new Error(
        'Failed to log in admin user for user tests setup. Status: ' +
        loginResponse.status +
        ' Body: ' +
        JSON.stringify(loginResponse.body)
      );
    }
    adminAuthToken = loginResponse.body.token;
    console.log('ADMIN AUTH TOKEN (user.integration.test.ts):', adminAuthToken ? adminAuthToken.substring(0, 20) + "..." : "NOT SET");

    // 3. Create another user (e.g., a Teacher) for GET by ID tests
    //    This user won't be created by the admin in a test, but exists for fetching.
    teacherForGetTest = await prisma.user.create({
      data: {
        name: 'Teacher To Be Fetched',
        phone: '1110001110', // Unique phone
        role: Role.TEACHER,
        passwordHash: await hashPassword('teacherPass123'),
      }
    });

  });

  afterAll(async () => {
    // Clean up all users after the entire test suite has run
    await prisma.user.deleteMany({});
  });

  describe('POST /api/users', () => {
    const uniquePhoneForCreate = '2220002220';

    afterEach(async () => {
      // Clean up user created specifically in POST tests to avoid phone conflicts
      await prisma.user.deleteMany({ where: { phone: uniquePhoneForCreate } });
    });

    it('should create a new user successfully when authenticated as admin', async () => {
      const userData = {
        name: 'New Teacher User',
        phone: uniquePhoneForCreate, // Use a unique phone for this test
        role: Role.TEACHER,
        password: 'newTeacherPassword123', // Assuming controller now takes plain password
      };

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(userData.name);
      expect(response.body.phone).toBe(userData.phone);
      expect(response.body.role).toBe(userData.role);
      expect(response.body).not.toHaveProperty('passwordHash'); // Ensure passwordHash is not returned

      // Verify in DB
      const dbUser = await prisma.user.findUnique({ where: { phone: userData.phone } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.name).toBe(userData.name);
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const userData = {
        name: 'Unauthorized User',
        phone: '2220002221',
        role: Role.TEACHER,
        password: 'password123',
      };
      const response = await request(app).post('/api/users').send(userData);
      expect(response.status).toBe(401);
      expect(response.body.message).toContain('No token provided');
    });

    it('should return 401 Unauthorized if an invalid token is provided', async () => {
      const userData = {
        name: 'Invalid Token User',
        phone: '2220002222',
        role: Role.TEACHER,
        password: 'password123',
      };
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', 'Bearer aninvalidtoken')
        .send(userData);
      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Invalid or expired token');
    });


    it('should return 400 if required fields are missing (authenticated)', async () => {
      const userData = {
        name: 'Missing Phone User',
        // phone: is missing
        role: Role.PARENT,
        password: 'password123',
      };
      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing required fields');
    });

    it('should return 409 Conflict if phone number already exists (authenticated)', async () => {
      // adminUser.phone already exists from beforeAll
      const userData = {
        name: 'Duplicate Phone User',
        phone: adminUser.phone, // Attempt to use existing admin's phone
        role: Role.TEACHER,
        password: 'anotherPassword123',
      };

      const response = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Phone number already exists');
    });

    // Add a test for 403 Forbidden if a non-admin tries to create a user,
    // assuming your POST /api/users route is protected by `authorize([Role.ADMIN])`
    // This requires getting a token for a non-admin user.
    // For now, this test is conceptual if you haven't set up authorize([Role.ADMIN])
    // on the user creation route specifically. If it's just `authenticate`, any valid token would pass this part.
    /*
    it('should return 403 Forbidden if non-admin tries to create user', async () => {
        // 1. Create and login a TEACHER user to get their token
        const tempTeacherPassword = "tempTeacherPass";
        const tempTeacherHashedPass = await hashPassword(tempTeacherPassword);
        const tempTeacher = await prisma.user.create({
            data: { name: "Temp Teacher", phone: "3330003330", role: Role.TEACHER, passwordHash: tempTeacherHashedPass }
        });
        const teacherLoginRes = await request(app).post('/api/auth/login').send({ phone: tempTeacher.phone, password: tempTeacherPassword });
        const teacherToken = teacherLoginRes.body.token;

        const userData = {
            name: 'User By Teacher',
            phone: '3330003331',
            role: Role.PARENT,
            password: 'somePassword',
        };

        const response = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send(userData);

        expect(response.status).toBe(403); // If authorize([Role.ADMIN]) is on the route
        expect(response.body.message).toContain('Forbidden');

        await prisma.user.delete({ where: { id: tempTeacher.id }}); // Clean up temp teacher
    });
    */
  });

  describe('GET /api/users/:id', () => {
    it('should return a user by ID if found when authenticated', async () => {

      console.log('USING TOKEN FOR GET USER (user.integration.test.ts):', adminAuthToken ? adminAuthToken.substring(0, 20) + "..." : "TOKEN NOT AVAILABLE");
      // teacherForGetTest was created in beforeAll
      const response = await request(app)
        .get(`/api/users/${teacherForGetTest.id}`)
        .set('Authorization', `Bearer ${adminAuthToken}`); // Any authenticated user can fetch (unless restricted by role)

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(teacherForGetTest.id);
      expect(response.body.name).toBe(teacherForGetTest.name);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should return 404 if user not found by ID (authenticated)', async () => {
      const nonExistentId = 'clxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; // A valid UUID format but non-existent
      const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 401 Unauthorized if no token is provided when getting a user', async () => {
      const response = await request(app).get(`/api/users/${teacherForGetTest.id}`);
      expect(response.status).toBe(401);
    });
  });

  // You can add more describe blocks for other user routes (PUT, DELETE) as you implement them,
  // ensuring they also use the adminAuthToken or appropriate tokens.
});
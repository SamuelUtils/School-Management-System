// tests/integration/admin.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';

describe('Admin API Endpoints (/api/admin)', () => {
  let adminUser: any;
  const adminPassword = 'AdminSuitePassword123!';
  let adminAuthToken: string;

  let nonAdminUser: any; // e.g., a teacher
  const nonAdminPassword = 'TeacherSuitePassword123!';
  let nonAdminAuthToken: string;

  let createdStudentId: string | null = null;
  let createdParentId: string | null = null; // This will be a User ID with PARENT role

  beforeAll(async () => {
    await prisma.user.deleteMany({});
    await prisma.student.deleteMany({}); // Clean students too

    // Create Admin User and get token
    const hashedAdminPassword = await hashPassword(adminPassword);
    adminUser = await prisma.user.create({
      data: {
        name: 'Super Admin for Admin Tests',
        phone: '9000000001',
        role: Role.ADMIN,
        passwordHash: hashedAdminPassword,
      },
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: adminPassword });
    adminAuthToken = adminLoginRes.body.token;
    if (!adminAuthToken) throw new Error('Failed to get admin token for admin tests');

    // Create Non-Admin User (Teacher) and get token (for testing forbidden access)
    const hashedNonAdminPassword = await hashPassword(nonAdminPassword);
    nonAdminUser = await prisma.user.create({
      data: {
        name: 'Regular Teacher for Admin Tests',
        phone: '9000000002',
        role: Role.TEACHER,
        passwordHash: hashedNonAdminPassword,
      },
    });
    const nonAdminLoginRes = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: nonAdminPassword });
    nonAdminAuthToken = nonAdminLoginRes.body.token;
    if (!nonAdminAuthToken) throw new Error('Failed to get non-admin token for admin tests');
  });

  afterAll(async () => {
    await prisma.student.deleteMany({}); // Order matters if there are FK constraints not set to cascade
    await prisma.user.deleteMany({});
  });

  afterEach(async () => {
    // Clean up specific entities created during tests if not handled by afterAll or if IDs are needed across tests
    // For now, we'll clean them up at the end of specific tests or rely on afterAll.
  });


  describe('POST /api/admin/parent', () => {
    const parentPhone = '9000000003';
    afterEach(async () => {
      await prisma.user.deleteMany({ where: { phone: parentPhone } });
    });

    it('should create a new parent (User with PARENT role) successfully', async () => {
      const parentData = {
        name: 'New Test Parent',
        phone: parentPhone,
        password: 'ParentPassword123',
      };
      const response = await request(app)
        .post('/api/admin/parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(parentData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      createdParentId = response.body.id; // Save for later tests
      expect(response.body.name).toBe(parentData.name);
      expect(response.body.phone).toBe(parentData.phone);
      expect(response.body.role).toBe(Role.PARENT);
      expect(response.body).not.toHaveProperty('passwordHash');

      const dbParent = await prisma.user.findUnique({ where: { phone: parentData.phone } });
      expect(dbParent).not.toBeNull();
      expect(dbParent?.role).toBe(Role.PARENT);
    });

    it('should return 409 if parent phone number already exists', async () => {
      const parentData = { name: 'Another Parent', phone: parentPhone, password: 'password' };
      // Create first parent
      await request(app).post('/api/admin/parent').set('Authorization', `Bearer ${adminAuthToken}`).send(parentData);
      // Attempt to create second with same phone
      const response = await request(app).post('/api/admin/parent').set('Authorization', `Bearer ${adminAuthToken}`).send(parentData);
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Phone number already in use.');
    });

    it('should return 403 Forbidden if a non-admin tries to create a parent', async () => {
      const parentData = { name: 'Parent By Teacher', phone: '9000000004', password: 'password' };
      const response = await request(app)
        .post('/api/admin/parent')
        .set('Authorization', `Bearer ${nonAdminAuthToken}`)
        .send(parentData);
      expect(response.status).toBe(403);
    });

    it('should return 401 Unauthorized if no token is provided', async () => {
      const parentData = { name: 'Parent No Token', phone: '9000000005', password: 'password' };
      const response = await request(app).post('/api/admin/parent').send(parentData);
      expect(response.status).toBe(401);
    });
  });


  describe('POST /api/admin/student', () => {
    const studentName = 'New Test Student';
    afterEach(async () => {
      await prisma.student.deleteMany({ where: { name: studentName } });
    });

    it('should create a new student successfully', async () => {
      const studentData = {
        name: studentName,
        currentClass: "5",
        section: 'SCH001',
        admissionNumber: 'ADM001'
      };
      const response = await request(app)
        .post('/api/admin/student')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      createdStudentId = response.body.id; // Save for mapping test
      expect(response.body.name).toBe(studentData.name);
      expect(response.body.currentClass).toBe(studentData.currentClass);
      expect(response.body.section).toBe(studentData.section);
      expect(response.body.admissionNumber).toBe(studentData.admissionNumber);
    });

    it('should return 400 if required student fields are missing', async () => {
      const studentData = { name: 'Incomplete Student' }; // Missing grade, schoolId
      const response = await request(app)
        .post('/api/admin/student')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Name, Admission Number, and Class are required.');
    });

    it('should return 403 Forbidden if a non-admin tries to create a student', async () => {
      const studentData = { name: 'Student By Teacher', currentClass: "3", section: 'SCH002', admissionNumber: 'ADM002' };
      const response = await request(app)
        .post('/api/admin/student')
        .set('Authorization', `Bearer ${nonAdminAuthToken}`)
        .send(studentData);
      expect(response.status).toBe(403);
    });
  });


  describe('POST /api/admin/student/map-parent', () => {
    let localStudentId: string;
    let localParentId: string; // User ID of parent

    beforeEach(async () => {
      // Create a fresh student and parent for each mapping test to ensure isolation
      const studentRes = await prisma.student.create({
        data: { name: 'Mappable Student', currentClass: "1", section: 'MAP_SCH', admissionNumber: 'MAP001' }
      });
      localStudentId = studentRes.id;

      const parentRes = await prisma.user.create({
        data: { name: 'Mappable Parent User', phone: `maptestparent${Date.now()}@example.com`, role: Role.PARENT, passwordHash: await hashPassword('mapPass') }
      });
      localParentId = parentRes.id;
    });

    afterEach(async () => {
      // Clean up student and parent created in beforeEach
      // Student parentId might be set, Prisma handles this or you can nullify first
      await prisma.student.deleteMany({ where: { id: localStudentId } });
      await prisma.user.deleteMany({ where: { id: localParentId } });
    });

    it('should map a parent to a student successfully', async () => {
      const mapData = { studentId: localStudentId, parentId: localParentId };
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(mapData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Parent successfully mapped to student');
      expect(response.body.student.id).toBe(localStudentId);
      expect(response.body.student.parentId).toBe(localParentId);
      expect(response.body.student.parent.id).toBe(localParentId);

      const dbStudent = await prisma.student.findUnique({ where: { id: localStudentId } });
      expect(dbStudent?.parentId).toBe(localParentId);
    });

    it('should return 404 if student does not exist', async () => {
      const mapData = { studentId: 'non-existent-student-id', parentId: localParentId };
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(mapData);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Student not found');
    });

    it('should return 404 if parent user does not exist', async () => {
      const mapData = { studentId: localStudentId, parentId: 'non-existent-parent-id' };
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(mapData);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Parent user not found');
    });

    it('should return 400 if specified parent user is not a PARENT role', async () => {
      // adminUser is not a PARENT
      const mapData = { studentId: localStudentId, parentId: adminUser.id };
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(mapData);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Specified user is not a Parent');
    });

    it('should return 409 if student is already mapped to the same parent', async () => {
      // First mapping
      await request(app).post('/api/admin/student/map-parent').set('Authorization', `Bearer ${adminAuthToken}`).send({ studentId: localStudentId, parentId: localParentId });
      // Second attempt to map to same parent
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ studentId: localStudentId, parentId: localParentId });
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Student is already mapped to this parent');
    });

    it('should return 409 if student is already mapped to a different parent (and re-mapping not allowed by current logic)', async () => {
      // Create another parent
      const anotherParent = await prisma.user.create({
        data: { name: 'Another Parent', phone: `anothermaptest${Date.now()}@example.com`, role: Role.PARENT, passwordHash: await hashPassword('pass') }
      });
      // First mapping
      await request(app).post('/api/admin/student/map-parent').set('Authorization', `Bearer ${adminAuthToken}`).send({ studentId: localStudentId, parentId: localParentId });
      // Attempt to map to another parent
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send({ studentId: localStudentId, parentId: anotherParent.id });
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Student is already mapped to another parent. Unmap first to change.');

      await prisma.user.delete({ where: { id: anotherParent.id } }); // cleanup
    });

    it('should return 403 Forbidden if a non-admin tries to map', async () => {
      const mapData = { studentId: localStudentId, parentId: localParentId };
      const response = await request(app)
        .post('/api/admin/student/map-parent')
        .set('Authorization', `Bearer ${nonAdminAuthToken}`)
        .send(mapData);
      expect(response.status).toBe(403);
    });
  });
});
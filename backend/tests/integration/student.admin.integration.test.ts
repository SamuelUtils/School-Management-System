// tests/integration/student.admin.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, Gender, StudentActiveStatus } from '.prisma/client'; // Import enums
import { hashPassword } from '@/lib/auth.utils';

describe('Admin Student Management API Endpoints (/api/admin/students)', () => {
  let adminUser: any;
  const adminPassword = 'StudentAdminPassword123!';
  let adminAuthToken: string;

  const uniqueAdmissionNumberBase = `ADM${Date.now()}`; // To help ensure uniqueness across test runs

  beforeAll(async () => {
    await prisma.student.deleteMany({}); // Clear students first due to potential FKs from other tables
    await prisma.user.deleteMany({});   // Then users

    // Create Admin User and get token
    const hashedAdminPassword = await hashPassword(adminPassword);
    adminUser = await prisma.user.create({
      data: {
        name: 'Student Management Admin',
        phone: 'stud_admin@example.com',
        role: Role.ADMIN,
        passwordHash: hashedAdminPassword,
      },
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: adminPassword });
    adminAuthToken = adminLoginRes.body.token;
    if (!adminAuthToken) throw new Error('Failed to get admin token for student admin tests');
  });

  afterAll(async () => {
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('POST /api/admin/students (Create Student)', () => {
    const studentDataBase = {
      name: 'New Test Student',
      currentClass: 'Grade 10',
      section: 'A',
      dateOfBirth: '2008-05-15',
      gender: Gender.MALE,
      status: StudentActiveStatus.ACTIVE,
    };

    afterEach(async () => {
      await prisma.student.deleteMany({ where: { admissionNumber: { startsWith: uniqueAdmissionNumberBase } } });
    });

    it('should create a new student successfully with all valid fields', async () => {
      const studentData = {
        ...studentDataBase,
        admissionNumber: `${uniqueAdmissionNumberBase}-001`,
      };
      const response = await request(app)
        .post('/api/admin/students')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(studentData.name);
      expect(response.body.admissionNumber).toBe(studentData.admissionNumber);
      expect(response.body.currentClass).toBe(studentData.currentClass);
      expect(response.body.section).toBe(studentData.section);
      expect(response.body.dateOfBirth).toBe(studentData.dateOfBirth);
      expect(response.body.gender).toBe(studentData.gender);
      expect(response.body.status).toBe(studentData.status);
      expect(response.body).toHaveProperty('admissionDate');

      const dbStudent = await prisma.student.findUnique({ where: { admissionNumber: studentData.admissionNumber } });
      expect(dbStudent).not.toBeNull();
    });

    it('should create a student with only required fields (and defaults)', async () => {
      const studentData = {
        name: 'Minimal Student',
        admissionNumber: `${uniqueAdmissionNumberBase}-002`,
        currentClass: 'Grade 1',
      };
      const response = await request(app)
        .post('/api/admin/students')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData);

      expect(response.status).toBe(201);
      expect(response.body.admissionNumber).toBe(studentData.admissionNumber);
      expect(response.body.status).toBe(StudentActiveStatus.ACTIVE); // Default
      expect(response.body.section).toBeNull(); // Default
      expect(response.body.dateOfBirth).toBeNull(); // Default
      expect(response.body.gender).toBeNull(); // Default
      expect(response.body).toHaveProperty('admissionDate');
    });

    it('should reject creation if admission number already exists', async () => {
      const admissionNumber = `${uniqueAdmissionNumberBase}-003`;
      const studentData1 = { ...studentDataBase, admissionNumber, name: "First Student" };
      await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(studentData1);

      const studentData2 = { ...studentDataBase, admissionNumber, name: "Second Student With Same ADMNO" };
      const response = await request(app)
        .post('/api/admin/students')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData2);
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Admission number already exists.');
    });

    it('should reject if required fields (name, admissionNumber, class) are missing', async () => {
      const missingName = { admissionNumber: `${uniqueAdmissionNumberBase}-004`, currentClass: '5' };
      const resName = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(missingName);
      expect(resName.status).toBe(400);
      expect(resName.body.message).toBe('Name, Admission Number, and Class are required.');

      const missingAdmNo = { name: 'Test', currentClass: '5' };
      const resAdmNo = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(missingAdmNo);
      expect(resAdmNo.status).toBe(400);

      const missingClass = { name: 'Test', admissionNumber: `${uniqueAdmissionNumberBase}-005` };
      const resClass = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(missingClass);
      expect(resClass.status).toBe(400);
    });

    it('should reject with invalid class format', async () => {
      const studentData = {
        ...studentDataBase,
        admissionNumber: `${uniqueAdmissionNumberBase}-006`,
        currentClass: 'Grade$$ десять'
      };
      const response = await request(app)
        .post('/api/admin/students')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .send(studentData);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Class format is invalid');
    });

    it('should reject with invalid section format (if section provided)', async () => {
      const studentData = { ...studentDataBase, admissionNumber: `${uniqueAdmissionNumberBase}-007`, section: 'Section@Alpha' };
      const response = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(studentData);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Section format is invalid');
    });

    it('should reject with invalid dateOfBirth format', async () => {
      const studentData = { ...studentDataBase, admissionNumber: `${uniqueAdmissionNumberBase}-008`, dateOfBirth: '15-05-2008' };
      const response = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(studentData);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid Date of Birth format');
    });

    it('should reject with invalid gender value', async () => {
      const studentData = { ...studentDataBase, admissionNumber: `${uniqueAdmissionNumberBase}-009`, gender: 'UNKNOWN_GENDER' };
      const response = await request(app).post('/api/admin/students').set('Authorization', `Bearer ${adminAuthToken}`).send(studentData as any); // Cast to any to allow invalid enum
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid gender value');
    });


    it('should return 403 Forbidden if non-admin tries to create', async () => {
      const nonAdminUser = await prisma.user.create({ data: { name: 'NonAdminStudentCreate', phone: 'nonadminstud@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
      const nonAdminLogin = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: 'pass' });
      const nonAdminToken = nonAdminLogin.body.token;

      const studentData = { ...studentDataBase, admissionNumber: `${uniqueAdmissionNumberBase}-010` };
      const response = await request(app)
        .post('/api/admin/students')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send(studentData);
      expect(response.status).toBe(403);
      await prisma.user.delete({ where: { id: nonAdminUser.id } });
    });
  });

  describe('GET /api/admin/students (List Students)', () => {
    let studentCreatedForList: any;

    beforeAll(async () => {
      studentCreatedForList = await prisma.student.create({
        data: {
          name: 'Listable Student',
          admissionNumber: `${uniqueAdmissionNumberBase}-LIST001`,
          currentClass: 'Grade 9'
        }
      });
    });

    it('should list all students, including the latest created', async () => {
      const response = await request(app)
        .get('/api/admin/students')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(response.status).toBe(200);
      const responseBody = response.body as any[];
      expect(Array.isArray(responseBody)).toBe(true);
      expect(responseBody.length).toBeGreaterThanOrEqual(1);

      const foundStudent = responseBody.find(s => s.id === studentCreatedForList.id);
      expect(foundStudent).toBeDefined();
      expect(foundStudent.name).toBe(studentCreatedForList.name);
      expect(foundStudent.admissionNumber).toBe(studentCreatedForList.admissionNumber);
      expect(foundStudent.admissionDate).toBeDefined(); // Check formatted date
      expect(foundStudent.dateOfBirth).toBeNull(); // Was not set for this student
    });

    it('should return 403 Forbidden if non-admin tries to list', async () => {
      const nonAdminUser = await prisma.user.create({ data: { name: 'NonAdminStudentList', phone: 'nonadminstudlist@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
      const nonAdminLogin = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: 'pass' });
      const nonAdminToken = nonAdminLogin.body.token;

      const response = await request(app)
        .get('/api/admin/students')
        .set('Authorization', `Bearer ${nonAdminToken}`);
      expect(response.status).toBe(403);
      await prisma.user.delete({ where: { id: nonAdminUser.id } });
    });
  });
});
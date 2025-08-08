// tests/integration/attendance.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Role, AttendanceStatus } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { notificationService } from '@/lib/notification.service'; // To spy on

// Mock Date.now() for time-sensitive tests
let mockDateNow: jest.SpyInstance<number, []> | undefined;

// Spy on notification service
const sendNotificationSpy = jest.spyOn(notificationService, 'sendNotification');

const getTodayDateString = (): string => {
  // If Date.now() is mocked, new Date() will reflect that mocked time.
  // This is generally what we want for consistency in tests.
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().split('T')[0];
};

const setupTestTime = (mockHourUTC: number, mockMinuteUTC: number = 0) => {
  // Clean up any existing mock
  if (mockDateNow) {
    mockDateNow.mockRestore();
  }

  const currentRealDate = new Date();
  // Construct a timestamp for "today" at the specified UTC time
  const targetMockTimestamp = Date.UTC(
    currentRealDate.getUTCFullYear(),
    currentRealDate.getUTCMonth(),
    currentRealDate.getUTCDate(),
    mockHourUTC,
    mockMinuteUTC,
    0, 0
  );
  mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(targetMockTimestamp);
};

const cleanupTestTime = () => {
  if (mockDateNow) {
    mockDateNow.mockRestore();
    mockDateNow = undefined;
  }
};

describe('Attendance API Endpoints', () => {
  let adminUser: any, teacherUser: any, parentUser: any, student1: any, student2: any;
  let adminToken: string, teacherToken: string;

  beforeAll(async () => {
    await prisma.attendance.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});

    // Admin
    adminUser = await prisma.user.create({
      data: { name: 'Att Admin', phone: 'attadmin@example.com', role: Role.ADMIN, passwordHash: await hashPassword('pass') },
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: 'pass' });
    adminToken = adminLoginRes.body.token;

    // Teacher
    teacherUser = await prisma.user.create({
      data: { name: 'Att Teacher', phone: 'attteacher@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') },
    });
    const teacherLoginRes = await request(app).post('/api/auth/login').send({ phone: teacherUser.phone, password: 'pass' });

    teacherToken = teacherLoginRes.body.token;
    // Add these debug logs
    // console.log('Teacher Login Response:', teacherLoginRes.body);
    // console.log('Teacher Token:', teacherToken ? 'Token exists' : 'No token');

    if (teacherToken) {
      const decoded = jwt.verify(teacherToken, process.env.JWT_SECRET!);
      // console.log('Decoded Teacher Token:', decoded);
    }

    // Parent (for notification test)
    parentUser = await prisma.user.create({
      data: { name: 'Att Parent', phone: 'attparent@example.com', role: Role.PARENT, passwordHash: await hashPassword('pass') },
    });

    // Students
    student1 = await prisma.student.create({
      data: { name: 'Student Alpha', currentClass: "1", section: 'S1', parentId: parentUser.id, admissionNumber: 'ATT001' },
    });
    student2 = await prisma.student.create({
      data: { name: 'Student Beta', currentClass: "1", section: 'S1', admissionNumber: 'ATT002' }, // No parent initially
    });
    // console.log('Teacher user:', teacherUser);
    const decodedTeacherToken = jwt.verify(teacherToken, process.env.JWT_SECRET!);
    // console.log('Decoded teacher token:', decodedTeacherToken);
  });

  afterAll(async () => {
    cleanupTestTime();
    await prisma.attendance.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});
  });

  beforeEach(() => {
    sendNotificationSpy.mockClear(); // Clear spy calls before each test
    cleanupTestTime(); // Reset time mock before each test by default
  });

  describe('POST /api/teacher/attendance (Mark Attendance by Teacher)', () => {
    it('should debug teacher authorization', async () => {
      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          date: getTodayDateString(),
          entries: []
        });

      // console.log('Debug Response:', {
      //   status: response.status,
      //   body: response.body,
      //   headers: response.headers
      // });
    });
    it('should allow teacher to mark attendance for students before cutoff time (12 PM)', async () => {
      setupTestTime(10); // Set time to 10:00 AM

      const attendancePayload = {
        date: getTodayDateString(),
        entries: [
          { studentId: student1.id, status: AttendanceStatus.PRESENT },
          { studentId: student2.id, status: AttendanceStatus.ABSENT },
        ],
      };
      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Attendance marked successfully');
      expect(response.body.count).toBe(2);

      const records = await prisma.attendance.findMany({ where: { date: new Date(getTodayDateString()) } });
      expect(records.length).toBe(2);
      expect(records.find(r => r.studentId === student1.id)?.status).toBe(AttendanceStatus.PRESENT);
      expect(records.find(r => r.studentId === student2.id)?.status).toBe(AttendanceStatus.ABSENT);

      // No notification should be sent since student2 (who is absent) has no parent
      expect(sendNotificationSpy).toHaveBeenCalledTimes(0);
    });

    it('should send notification if student with parent is marked absent', async () => {
      setupTestTime(10); // 10:00 AM
      const today = getTodayDateString();

      await prisma.attendance.deleteMany({ where: { date: new Date(today) } }); // Clean today's attendance

      const attendancePayload = {
        date: today,
        entries: [{ studentId: student1.id, status: AttendanceStatus.ABSENT }], // student1 has parent
      };

      await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);

      expect(sendNotificationSpy).toHaveBeenCalledTimes(1);
      expect(sendNotificationSpy).toHaveBeenCalledWith({
        to: parentUser.phone,
        message: `Dear Parent, your child ${student1.name} was marked ABSENT on ${today}.`,
      });
    });

    it('should reject attendance marking if after cutoff time (12 PM)', async () => {
      setupTestTime(13); // Set time to 1:00 PM (13:00)

      const attendancePayload = {
        date: getTodayDateString(),
        entries: [{ studentId: student1.id, status: AttendanceStatus.PRESENT }],
      };

      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Attendance can only be marked for today before 12:00 server time.');
    });

    it('should reject if trying to mark for a non-today date before cutoff', async () => {
      setupTestTime(10); // 10 AM
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const attendancePayload = {
        date: yesterday.toISOString().split('T')[0],
        entries: [{ studentId: student1.id, status: AttendanceStatus.PRESENT }],
      };
      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);
      expect(response.status).toBe(403); // because isBeforeAttendanceCutoff checks for today
    });

    it('should return 409 if attendance already marked for a student on that date by teacher', async () => {
      setupTestTime(9); // 9 AM
      const today = getTodayDateString();
      // First, mark successfully
      await request(app).post('/api/teacher/attendance').set('Authorization', `Bearer ${teacherToken}`).send({
        date: today, entries: [{ studentId: student1.id, status: AttendanceStatus.PRESENT }]
      });
      // Then, try to mark again
      const response = await request(app).post('/api/teacher/attendance').set('Authorization', `Bearer ${teacherToken}`).send({
        date: today, entries: [{ studentId: student1.id, status: AttendanceStatus.ABSENT }]
      });
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Attendance already marked for some students on this date.');
      await prisma.attendance.deleteMany({ where: { date: new Date(today), studentId: student1.id } }); // cleanup
    });

    it('should return 400 if studentId is invalid in entries', async () => {
      setupTestTime(10);
      const attendancePayload = {
        date: getTodayDateString(),
        entries: [{ studentId: 'non-existent-student', status: AttendanceStatus.PRESENT }],
      };
      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);
      expect(response.status).toBe(400); // Due to Prisma P2003 FK constraint or your validation
      expect(response.body.message).toContain('One or more student IDs are invalid.');
    });

    it('should be protected: only TEACHER role can mark', async () => {
      setupTestTime(10);
      const attendancePayload = { date: getTodayDateString(), entries: [] };
      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${adminToken}`) // Admin trying teacher's route
        .send(attendancePayload);
      expect(response.status).toBe(403); // Forbidden due to role
    });
  });

  describe('PATCH /api/admin/attendance/:id (Admin Override)', () => {
    let attendanceRecord: any;

    beforeEach(async () => {
      // Create an attendance record for admin to override
      // Ensure this doesn't conflict with teacher marking tests (e.g., use a different date or clean up)
      const overrideDate = new Date('2023-01-01'); // Fixed past date
      await prisma.attendance.deleteMany({ where: { studentId: student1.id, date: overrideDate } });
      attendanceRecord = await prisma.attendance.create({
        data: {
          studentId: student1.id,
          date: overrideDate,
          status: AttendanceStatus.ABSENT,
          markedById: teacherUser.id, // Initially marked by teacher
        },
      });
    });

    it('should allow admin to override an existing attendance record', async () => {
      const response = await request(app)
        .patch(`/api/admin/attendance/${attendanceRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: AttendanceStatus.PRESENT });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(AttendanceStatus.PRESENT);
      expect(response.body.markedById).toBe(adminUser.id); // Check if markedBy is updated

      const dbRecord = await prisma.attendance.findUnique({ where: { id: attendanceRecord.id } });
      expect(dbRecord?.status).toBe(AttendanceStatus.PRESENT);
      expect(dbRecord?.markedById).toBe(adminUser.id);
    });

    it('should return 404 if attendance record not found', async () => {
      const response = await request(app)
        .patch(`/api/admin/attendance/non-existent-id`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: AttendanceStatus.PRESENT });
      expect(response.status).toBe(404);
    });

    it('should return 400 if status is invalid', async () => {
      const response = await request(app)
        .patch(`/api/admin/attendance/${attendanceRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'INVALID_STATUS' });
      expect(response.status).toBe(400);
    });

    it('should be protected: only ADMIN role can override', async () => {
      const response = await request(app)
        .patch(`/api/admin/attendance/${attendanceRecord.id}`)
        .set('Authorization', `Bearer ${teacherToken}`) // Teacher trying admin's route
        .send({ status: AttendanceStatus.PRESENT });
      expect(response.status).toBe(403);
    });
  });

  // Test for "Bulk marking (all present)" - this is a variation of POST /teacher/attendance
  describe('POST /api/teacher/attendance (Bulk Marking All Present)', () => {
    it('should allow teacher to mark all students as PRESENT (simulating a bulk action)', async () => {
      setupTestTime(10); // 10 AM
      const today = getTodayDateString();
      await prisma.attendance.deleteMany({ where: { date: new Date(today) } }); // Clean previous

      const allStudents = await prisma.student.findMany({ select: { id: true } });
      const attendancePayload = {
        date: today,
        entries: allStudents.map(s => ({ studentId: s.id, status: AttendanceStatus.PRESENT })),
      };

      const response = await request(app)
        .post('/api/teacher/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(attendancePayload);

      expect(response.status).toBe(201);
      expect(response.body.count).toBe(allStudents.length);

      const records = await prisma.attendance.findMany({ where: { date: new Date(today) } });
      expect(records.length).toBe(allStudents.length);
      records.forEach(r => expect(r.status).toBe(AttendanceStatus.PRESENT));
      expect(sendNotificationSpy).not.toHaveBeenCalled(); // No one absent
    });
  });
});
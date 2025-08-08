// tests/integration/teacher.timetable.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, DayOfWeek } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';

describe('Teacher Timetable API Endpoint (/api/teacher/timetable)', () => {
  let adminUser: any, teacher1: any, teacher2: any;
  const adminPassword = 'TeacherTimetableAdminPass!';
  const teacher1Password = 'teacher1pass';
  const teacher2Password = 'teacher2pass';
  let adminAuthToken: string;
  let teacher1AuthToken: string;
  let teacher2AuthToken: string; // Teacher with no slots

  const testClass = 'Grade8';
  const testSection = 'C';

  beforeAll(async () => {
    await prisma.timetableSlot.deleteMany({});
    await prisma.user.deleteMany({});

    // Admin (for creating initial timetable slots if needed by other tests, or just for role testing)
    adminUser = await prisma.user.create({
      data: { name: 'TT Admin', phone: 'tt_admin_teacher@example.com', role: Role.ADMIN, passwordHash: await hashPassword(adminPassword) },
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: adminPassword });
    adminAuthToken = adminLoginRes.body.token;

    // Teacher 1 (will have slots assigned)
    teacher1 = await prisma.user.create({
      data: { name: 'Ms. Davis (Teacher 1)', phone: 'msdavis@example.com', role: Role.TEACHER, passwordHash: await hashPassword(teacher1Password) },
    });
    const t1LoginRes = await request(app).post('/api/auth/login').send({ phone: teacher1.phone, password: teacher1Password });
    teacher1AuthToken = t1LoginRes.body.token;

    // Teacher 2 (will have no slots assigned)
    teacher2 = await prisma.user.create({
      data: { name: 'Mr. Lee (Teacher 2)', phone: 'mrlee@example.com', role: Role.TEACHER, passwordHash: await hashPassword(teacher2Password) },
    });
    const t2LoginRes = await request(app).post('/api/auth/login').send({ phone: teacher2.phone, password: teacher2Password });
    teacher2AuthToken = t2LoginRes.body.token;


    // Create some timetable slots and assign one set to teacher1
    // These are created directly, assuming an Admin would have set them up
    await prisma.timetableSlot.createMany({
      data: [
        // Slots for Teacher 1
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '10:00', endTime: '11:00', currentClass: testClass, section: testSection, subject: 'History', teacherId: teacher1.id },
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSection, subject: 'Geography', teacherId: teacher1.id }, // Earlier slot
        { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '14:00', endTime: '15:00', currentClass: testClass, section: testSection, subject: 'History', teacherId: teacher1.id },
        // Slot for another teacher or unassigned
        { dayOfWeek: DayOfWeek.MONDAY, startTime: '11:00', endTime: '12:00', currentClass: testClass, section: testSection, subject: 'Physics', teacherId: null },
      ]
    });
  });

  afterAll(async () => {
    await prisma.timetableSlot.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it('should allow an authenticated teacher to retrieve their assigned timetable slots, sorted correctly', async () => {
    const response = await request(app)
      .get('/api/teacher/timetable')
      .set('Authorization', `Bearer ${teacher1AuthToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    const slots = response.body;
    expect(slots.length).toBe(3); // Teacher 1 has 3 slots

    // Check sorting: Monday 09:00, then Monday 10:00, then Wednesday 14:00
    expect(slots[0].subject).toBe('Geography'); // Mon 09:00
    expect(slots[0].startTime).toBe('09:00');
    expect(slots[0].dayOfWeek).toBe(DayOfWeek.MONDAY);

    expect(slots[1].subject).toBe('History');   // Mon 10:00
    expect(slots[1].startTime).toBe('10:00');
    expect(slots[1].dayOfWeek).toBe(DayOfWeek.MONDAY);

    expect(slots[2].subject).toBe('History');   // Wed 14:00
    expect(slots[2].startTime).toBe('14:00');
    expect(slots[2].dayOfWeek).toBe(DayOfWeek.WEDNESDAY);

    // Ensure only teacher1's slots are returned
    slots.forEach((slot: any) => {
      expect(slot.teacherId).toBe(teacher1.id);
    });
  });

  it('should return an empty array for a teacher with no assigned slots', async () => {
    const response = await request(app)
      .get('/api/teacher/timetable')
      .set('Authorization', `Bearer ${teacher2AuthToken}`); // teacher2 has no slots

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should return 401 Unauthorized if no token is provided', async () => {
    const response = await request(app).get('/api/teacher/timetable');
    expect(response.status).toBe(401);
  });

  it('should return 403 Forbidden if a non-teacher (e.g., Admin) tries to access this specific teacher route', async () => {
    // This tests if the `authorize([Role.TEACHER])` on the route group is working.
    const response = await request(app)
      .get('/api/teacher/timetable')
      .set('Authorization', `Bearer ${adminAuthToken}`); // Admin token
    expect(response.status).toBe(403);
  });

  it('should return 401 Unauthorized if token is invalid', async () => {
    const response = await request(app)
      .get('/api/teacher/timetable')
      .set('Authorization', 'Bearer aninvalidtoken');
    expect(response.status).toBe(401);
  });
});
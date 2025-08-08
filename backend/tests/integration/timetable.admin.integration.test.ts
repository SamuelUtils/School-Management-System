// tests/integration/timetable.admin.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, DayOfWeek, TimetableSlot } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { timeToMinutes, getDayOfWeekFromDate } from '@/lib/time.utils';// Import helper

interface TestUser {
  id: string;
  token?: string;
}

let adminUser: TestUser;
const adminPassword = 'admin123';

let teacherUser: TestUser;
let teacherUser2: TestUser;

describe('Admin Timetable Management API Endpoints (/api/admin/timetable)', () => {
  // Clean up database before tests
  beforeAll(async () => {
    // Delete in correct order to respect foreign key constraints
    await prisma.timetableSlot.deleteMany({});
    await prisma.studentFee.deleteMany({}); // Delete StudentFee records first
    await prisma.student.deleteMany({}); // Delete Students next
    await prisma.user.deleteMany({}); // Now we can safely delete Users

    adminUser = await prisma.user.create({
      data: { name: 'Timetable Admin', phone: 'tt_admin@example.com', role: Role.ADMIN, passwordHash: await hashPassword(adminPassword) },
    });

    teacherUser = await prisma.user.create({
      data: { name: 'Test Teacher', phone: 'teacher1@example.com', role: Role.TEACHER, passwordHash: await hashPassword('teacher123') },
    });

    teacherUser2 = await prisma.user.create({
      data: { name: 'Test Teacher 2', phone: 'teacher2@example.com', role: Role.TEACHER, passwordHash: await hashPassword('teacher123') },
    });

    // Get admin token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: 'tt_admin@example.com', password: adminPassword });

    adminUser.token = loginRes.body.token;

    // Get teacher token
    const teacherLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ phone: 'teacher1@example.com', password: 'teacher123' });

    teacherUser.token = teacherLoginRes.body.token;
  });

  // Clean up database after tests
  afterAll(async () => {
    // Delete in correct order to respect foreign key constraints
    await prisma.timetableSlot.deleteMany({});
    await prisma.studentFee.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});
  });

  afterEach(async () => {
    // Clean up timetable slots after each test
    await prisma.timetableSlot.deleteMany({});
  });

  const testClass = 'Grade10';
  const testSectionA = 'A';
  const testSectionB = 'B';

  describe('POST /api/admin/timetable (Create/Update Slot)', () => {
    const validSlotData = {
      dayOfWeek: DayOfWeek.MONDAY,
      startTime: '09:00',
      endTime: '10:00',
      currentClass: testClass,
      section: testSectionA,
      subject: 'Mathematics',
      teacherId: null, // Can be teacher1.id later
    };

    it('should create a new timetable slot successfully', async () => {
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(validSlotData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.subject).toBe('Mathematics');
      expect(response.body.startTime).toBe('09:00');
    });

    it('should update an existing timetable slot successfully', async () => {
      const createResponse = await request(app).post('/api/admin/timetable').set('Authorization', `Bearer ${adminUser.token}`).send(validSlotData);
      const slotId = createResponse.body.id;

      const updateData = { ...validSlotData, id: slotId, subject: 'Advanced Mathematics', teacherId: teacherUser.id };
      const updateResponse = await request(app)
        .post('/api/admin/timetable') // Using POST for update as per endpoint design
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(updateData);

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.id).toBe(slotId);
      expect(updateResponse.body.subject).toBe('Advanced Mathematics');
      expect(updateResponse.body.teacherId).toBe(teacherUser.id);
    });

    it('should prevent creating a slot with start time after end time', async () => {
      const invalidTimeData = { ...validSlotData, startTime: '11:00', endTime: '10:00' };
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(invalidTimeData);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Start time must be before end time.');
    });

    it('should prevent creating overlapping slots for the same class/section', async () => {
      // Create first slot
      await request(app).post('/api/admin/timetable').set('Authorization', `Bearer ${adminUser.token}`).send(validSlotData);

      // Attempt to create overlapping slot (same class/section/day, different subject, overlapping time)
      const overlappingSlotData = {
        ...validSlotData,
        startTime: '09:30', // Overlaps with 09:00-10:00
        endTime: '10:30',
        subject: 'Physics', // Different subject
      };
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(overlappingSlotData);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Class/Section conflict');
    });

    it('should prevent assigning a teacher to an overlapping slot', async () => {
      // Slot 1 for teacher1
      await request(app).post('/api/admin/timetable').set('Authorization', `Bearer ${adminUser.token}`).send({
        ...validSlotData, teacherId: teacherUser.id
      });

      // Slot 2 for another class but same teacher and overlapping time
      const teacherConflictData = {
        dayOfWeek: DayOfWeek.MONDAY,
        startTime: '09:30',
        endTime: '10:30',
        currentClass: 'Grade9', // Different class
        section: 'A',
        subject: 'Chemistry',
        teacherId: teacherUser.id, // Same teacher
      };
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(teacherConflictData);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Teacher conflict');
    });

    it('should allow creating same subject slot if class/section/time is different', async () => {
      await request(app).post('/api/admin/timetable').set('Authorization', `Bearer ${adminUser.token}`).send(validSlotData); // Grade10 A, Mon 09:00 Maths

      const differentSlotData = { ...validSlotData, section: testSectionB }; // Same time, different section
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(differentSlotData);
      expect(response.status).toBe(201);
    });

    it('should return 400 for invalid teacherId', async () => {
      const slotWithInvalidTeacher = { ...validSlotData, teacherId: 'non-existent-teacher-id' };
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(slotWithInvalidTeacher);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Teacher with ID');
    });

    it('can create a date-specific slot using the regular endpoint', async () => {
      const specificDateSlot = {
        dayOfWeek: DayOfWeek.FRIDAY, // Contextual day, but date field takes precedence
        startTime: '10:00',
        endTime: '11:00',
        currentClass: testClass,
        section: testSectionA,
        subject: 'Special Event',
        date: '2024-07-26' // A specific Friday
      };
      const response = await request(app)
        .post('/api/admin/timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(specificDateSlot);
      expect(response.status).toBe(201);
      expect(response.body.date).toContain('2024-07-26');
      expect(response.body.subject).toBe('Special Event');
    });
  });

  describe('GET /api/admin/timetable/:class/:section?', () => {
    beforeEach(async () => { // Populate some data for listing
      await prisma.timetableSlot.createMany({
        data: [
          { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Maths', teacherId: teacherUser.id },
          { dayOfWeek: DayOfWeek.MONDAY, startTime: '10:00', endTime: '11:00', currentClass: testClass, section: testSectionA, subject: 'Science' },
          { dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'English' },
          { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionB, subject: 'Maths' }, // Different section
          { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: 'Grade9', section: testSectionA, subject: 'History' }, // Different class
        ]
      });
    });

    it('should list timetable slots for a specific class and section, ordered by day and time', async () => {
      const response = await request(app)
        .get(`/api/admin/timetable/${testClass}/${testSectionA}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      const slots = response.body;
      expect(slots.length).toBe(3); // Mon(Maths, Science), Tue(English) for Grade10 A
      expect(slots[0].dayOfWeek).toBe(DayOfWeek.MONDAY);
      expect(slots[0].startTime).toBe('09:00');
      expect(slots[0].subject).toBe('Maths');
      expect(slots[1].dayOfWeek).toBe(DayOfWeek.MONDAY);
      expect(slots[1].startTime).toBe('10:00');
      expect(slots[2].dayOfWeek).toBe(DayOfWeek.TUESDAY);
    });

    it('should list timetable slots for a class if section is not specified (and slots have null section)', async () => {
      // Create a slot with null section for testClass
      await prisma.timetableSlot.create({
        data: { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '11:00', endTime: '12:00', currentClass: testClass, section: null, subject: 'Art' }
      });

      const response = await request(app)
        .get(`/api/admin/timetable/${testClass}`) // No section in URL
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(response.status).toBe(200);
      const artSlot = response.body.find((s: any) => s.subject === 'Art');
      expect(artSlot).toBeDefined();
      expect(artSlot.section).toBeNull();
    });

    it('should return empty array if no slots found for class/section', async () => {
      const response = await request(app)
        .get(`/api/admin/timetable/NonExistentClass/X`)
        .set('Authorization', `Bearer ${adminUser.token}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/admin/alternate-timetable (Set Alternate Schedule for a Date)', () => {
    const alternateDate = '2024-09-05'; // Assume this is a Thursday
    const derivedDayOfWeek = getDayOfWeekFromDate(new Date(alternateDate)); // Should be THURSDAY
    let alternateSlotsPayload: any;

    beforeEach(() => {
      alternateSlotsPayload = {
        date: alternateDate,
        slots: [
          { startTime: '09:00', endTime: '11:00', currentClass: testClass, section: testSectionA, subject: 'Exam Prep 1', teacherId: teacherUser.id },
          { startTime: '11:30', endTime: '13:30', currentClass: testClass, section: testSectionA, subject: 'Exam Prep 2' },
        ]
      };
    });

    it('should create a new alternate timetable for a specific date', async () => {
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(alternateSlotsPayload);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain(`Alternate timetable for ${alternateDate} set successfully`);
      expect(response.body.date).toBe(alternateDate);
      expect(response.body.slots.length).toBe(2);
      response.body.slots.forEach((slot: any) => {
        expect(slot.date).toContain(alternateDate);
        expect(slot.dayOfWeek).toBe(derivedDayOfWeek); // Check if controller set it
      });

      const dbSlots = await prisma.timetableSlot.findMany({ where: { date: new Date(Date.UTC(2024, 8, 5)) } }); // Month is 0-indexed
      expect(dbSlots.length).toBe(2);
      expect(dbSlots.find((s: TimetableSlot) => s.subject === 'Exam Prep 1')).toBeDefined();
    });

    it('should replace existing alternate timetable if called again for the same date', async () => {
      // First call
      await request(app).post('/api/admin/alternate-timetable').set('Authorization', `Bearer ${adminUser.token}`).send(alternateSlotsPayload);

      const newAlternateSlotsPayload = {
        date: alternateDate,
        slots: [{ startTime: '10:00', endTime: '12:00', currentClass: testClass, section: testSectionA, subject: 'Revised Exam Prep' }]
      };
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(newAlternateSlotsPayload);

      expect(response.status).toBe(201);
      expect(response.body.slots.length).toBe(1);
      expect(response.body.slots[0].subject).toBe('Revised Exam Prep');

      const dbSlots = await prisma.timetableSlot.findMany({ where: { date: new Date(Date.UTC(2024, 8, 5)) } });
      expect(dbSlots.length).toBe(1);
    });

    it('should prevent conflicts within the submitted alternate slots (e.g., teacher clash)', async () => {
      const conflictingPayload = {
        date: alternateDate,
        slots: [
          { startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Sub A', teacherId: teacherUser.id },
          { startTime: '09:30', endTime: '10:30', currentClass: testClass, section: testSectionB, subject: 'Sub B', teacherId: teacherUser.id }, // Teacher clash
        ]
      };
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(conflictingPayload);
      expect(response.status).toBe(409); // Or 400 if validation is before transaction
      expect(response.body.message).toContain('Teacher conflict within the submitted alternate schedule');
    });

    it('should prevent conflicts within submitted alternate slots (e.g. class/section clash)', async () => {
      const conflictingPayload = {
        date: alternateDate,
        slots: [
          { startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Sub A' },
          { startTime: '09:30', endTime: '10:30', currentClass: testClass, section: testSectionA, subject: 'Sub B' }, // Class/section clash
        ]
      };
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(conflictingPayload);
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('Class/Section conflict within the submitted alternate schedule');
    });


    it('should return 400 if date is missing or invalid', async () => {
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ slots: [] }); // Missing date
      expect(response.status).toBe(400);

      const response2 = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ date: 'invalid-date', slots: [] });
      expect(response2.status).toBe(400);
    });

    it('should return 400 if any slot data is invalid', async () => {
      const invalidSlotPayload = {
        date: alternateDate,
        slots: [{ startTime: '10:00', currentClass: testClass, subject: 'Missing End Time' }] // Missing endTime
      };
      const response = await request(app)
        .post('/api/admin/alternate-timetable')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send(invalidSlotPayload);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Each slot must have startTime, endTime, currentClass, and subject');
    });
  });

  describe('GET /api/admin/timetable/:class/:section? (Querying with date for alternate)', () => {
    const queryDate = '2024-10-10'; // Assume this is a Thursday
    const queryDayOfWeek = DayOfWeek.THURSDAY;

    beforeEach(async () => { // Populate data for these specific listing tests
      await prisma.timetableSlot.deleteMany({}); // Clean before each to avoid interference
      // Regular slot for that day
      await prisma.timetableSlot.create({
        data: { dayOfWeek: queryDayOfWeek, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Regular Subject', date: null }
      });
      // Alternate slot for the specific date
      await prisma.timetableSlot.create({
        data: { dayOfWeek: queryDayOfWeek, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Alternate Subject for Date', date: new Date(Date.UTC(2024, 9, 10)) }
      });
      // Another alternate slot for the same date, different time
      await prisma.timetableSlot.create({
        data: { dayOfWeek: queryDayOfWeek, startTime: '10:00', endTime: '11:00', currentClass: testClass, section: testSectionA, subject: 'Another Alt Subject', date: new Date(Date.UTC(2024, 9, 10)) }
      });
    });

    it('should return alternate timetable slots if available for the queried date', async () => {
      const response = await request(app)
        .get(`/api/admin/timetable/${testClass}/${testSectionA}?date=${queryDate}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2); // Only the 2 alternate slots for that date
      expect(response.body.find((s: any) => s.subject === 'Alternate Subject for Date')).toBeDefined();
      expect(response.body.find((s: any) => s.subject === 'Another Alt Subject')).toBeDefined();
      expect(response.body.find((s: any) => s.subject === 'Regular Subject')).toBeUndefined();
      response.body.forEach((slot: any) => expect(slot.date).toContain(queryDate));
    });

    it('should return regular weekly slots for the day if no alternate slots exist for the queried date', async () => {
      const nonAlternateDate = '2024-10-11'; // Assume this is a Friday, and no alternates are set
      const nonAlternateDayOfWeek = DayOfWeek.FRIDAY;
      await prisma.timetableSlot.create({
        data: { dayOfWeek: nonAlternateDayOfWeek, startTime: '11:00', endTime: '12:00', currentClass: testClass, section: testSectionA, subject: 'Regular Friday Subject', date: null }
      });

      const response = await request(app)
        .get(`/api/admin/timetable/${testClass}/${testSectionA}?date=${nonAlternateDate}`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].subject).toBe('Regular Friday Subject');
      expect(response.body[0].date).toBeNull();
      expect(response.body[0].dayOfWeek).toBe(nonAlternateDayOfWeek);
    });

    it('should return all regular weekly slots if no date is queried', async () => {
      await prisma.timetableSlot.deleteMany({}); // Clear everything
      await prisma.timetableSlot.create({
        data: { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Mon Regular', date: null }
      });
      await prisma.timetableSlot.create({
        data: { dayOfWeek: DayOfWeek.TUESDAY, startTime: '10:00', endTime: '11:00', currentClass: testClass, section: testSectionA, subject: 'Tue Regular', date: null }
      });
      // Add a date-specific one that should NOT be returned
      await prisma.timetableSlot.create({
        data: { dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00', currentClass: testClass, section: testSectionA, subject: 'Mon Alt', date: new Date(Date.UTC(2024, 0, 1)) }
      });


      const response = await request(app)
        .get(`/api/admin/timetable/${testClass}/${testSectionA}`) // No ?date query
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2); // Should only be the two 'date: null' slots
      expect(response.body.find((s: any) => s.subject === 'Mon Regular')).toBeDefined();
      expect(response.body.find((s: any) => s.subject === 'Tue Regular')).toBeDefined();
      expect(response.body.find((s: any) => s.subject === 'Mon Alt')).toBeUndefined();
    });
  });

  // Also update tests for GET /teacher/timetable to accept and use ?date query param
  describe('GET /api/teacher/timetable (Querying with date for alternate)', () => {
    // ... (similar setup as admin GET, but filter by teacherId)
    const queryDateTeacher = '2024-11-11'; // A Monday
    const queryDayOfWeekTeacher = DayOfWeek.MONDAY;

    beforeEach(async () => {
      await prisma.timetableSlot.deleteMany({}); // Clear before each
      // Regular slot for teacher1
      await prisma.timetableSlot.create({
        data: { dayOfWeek: queryDayOfWeekTeacher, startTime: '09:00', endTime: '10:00', currentClass: 'SomeClass', subject: 'Teacher Regular', teacherId: teacherUser.id, date: null }
      });
      // Alternate slot for teacher1 on queryDateTeacher
      await prisma.timetableSlot.create({
        data: { dayOfWeek: queryDayOfWeekTeacher, startTime: '10:00', endTime: '11:00', currentClass: 'SomeClass', subject: 'Teacher Alternate', teacherId: teacherUser.id, date: new Date(Date.UTC(2024, 10, 11)) } // Nov 11
      });
    });

    it('should return teacher alternate slots for the queried date', async () => {
      const response = await request(app)
        .get(`/api/teacher/timetable?date=${queryDateTeacher}`)
        .set('Authorization', `Bearer ${teacherUser.token}`);
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].subject).toBe('Teacher Alternate');
    });

    it('should return teacher regular slots for the day if no alternate on queried date', async () => {
      const dateWithNoAlternate = '2024-11-12'; // A Tuesday, assume no alternates
      // Ensure teacher1 has a regular Tuesday slot
      await prisma.timetableSlot.create({
        data: { dayOfWeek: DayOfWeek.TUESDAY, startTime: '09:00', endTime: '10:00', currentClass: 'SomeClass', subject: 'Teacher Tuesday Regular', teacherId: teacherUser.id, date: null }
      });

      const response = await request(app)
        .get(`/api/teacher/timetable?date=${dateWithNoAlternate}`)
        .set('Authorization', `Bearer ${teacherUser.token}`);
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].subject).toBe('Teacher Tuesday Regular');
    });
  });
});
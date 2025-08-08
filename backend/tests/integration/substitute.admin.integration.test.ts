// tests/integration/substitute.admin.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, DayOfWeek } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';

describe('Admin Substitute Teacher API Endpoints (/api/admin/substitute)', () => {
    let adminUser: any, teacher1: any, teacher2_sub: any, teacher3_original: any;
    let adminAuthToken: string, teacher1AuthToken: string, teacher2AuthToken: string;
    let weeklySlot: any, dateSpecificSlot: any;

    const today = new Date();
    const specificDateForTest = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 7)); // A week from today
    const specificDateString = specificDateForTest.toISOString().split('T')[0];


    beforeAll(async () => {
        await prisma.timetableSlot.deleteMany({});
        await prisma.user.deleteMany({});

        adminUser = await prisma.user.create({
            data: { name: 'Sub Admin', phone: 'sub_admin@example.com', role: Role.ADMIN, passwordHash: await hashPassword('pass') },
        });
        const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: 'pass' });
        adminAuthToken = adminLoginRes.body.token;

        teacher1 = await prisma.user.create({
            data: { name: 'Teacher Original', phone: 't_orig@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') },
        });
        const t1Login = await request(app).post('/api/auth/login').send({ phone: teacher1.phone, password: 'pass' });
        teacher1AuthToken = t1Login.body.token;


        teacher2_sub = await prisma.user.create({
            data: { name: 'Teacher Substitute', phone: 't_sub@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') },
        });
        const t2Login = await request(app).post('/api/auth/login').send({ phone: teacher2_sub.phone, password: 'pass' });
        teacher2AuthToken = t2Login.body.token;


        teacher3_original = await prisma.user.create({
            data: { name: 'Teacher 3 Original', phone: 't3_orig@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') },
        });


        // Create a regular weekly slot assigned to teacher3_original
        weeklySlot = await prisma.timetableSlot.create({
            data: {
                dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00',
                currentClass: 'Grade5', section: 'A', subject: 'Science',
                teacherId: teacher3_original.id,
                date: null, // Regular weekly slot
            }
        });

        // Create a date-specific slot for testing substitution
        dateSpecificSlot = await prisma.timetableSlot.create({
            data: {
                dayOfWeek: getDayOfWeekFromDate(specificDateForTest), // Corresponding day
                startTime: '10:00', endTime: '11:00',
                currentClass: 'Grade5', section: 'A', subject: 'Maths Special',
                teacherId: teacher1.id,
                date: specificDateForTest,
            }
        });
    });

    // Helper to get DayOfWeek from a Date object (copy from admin.controller or import from utils)
    const getDayOfWeekFromDate = (date: Date): DayOfWeek => {
        const dayIndex = date.getUTCDay();
        const days: DayOfWeek[] = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
        return days[dayIndex];
    };


    afterAll(async () => {
        await prisma.timetableSlot.deleteMany({});
        await prisma.user.deleteMany({});
    });


    describe('POST /api/admin/substitute (Assign Substitute)', () => {
        it('should successfully assign a substitute teacher to a date-specific slot', async () => {
            const payload = { timetableSlotId: dateSpecificSlot.id, substituteTeacherId: teacher2_sub.id };
            const response = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Substitute teacher assigned successfully.');
            expect(response.body.slot.id).toBe(dateSpecificSlot.id);
            expect(response.body.slot.teacherId).toBe(teacher1.id); // Original teacher remains
            expect(response.body.slot.substituteTeacherId).toBe(teacher2_sub.id);
            expect(response.body.slot.substituteTeacher.name).toBe(teacher2_sub.name);

            const dbSlot = await prisma.timetableSlot.findUnique({ where: { id: dateSpecificSlot.id } });
            expect(dbSlot?.substituteTeacherId).toBe(teacher2_sub.id);
        });

        it('should successfully assign a substitute teacher to a weekly slot (applies to all occurrences)', async () => {
            // Note: Current simple model applies sub to all weeks for a weekly slot.
            // A more advanced model would create a date-specific override.
            const payload = { timetableSlotId: weeklySlot.id, substituteTeacherId: teacher2_sub.id };
            const response = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.slot.substituteTeacherId).toBe(teacher2_sub.id);
        });


        it('should return 404 if timetable slot not found', async () => {
            const payload = { timetableSlotId: 'non-existent-slot-id', substituteTeacherId: teacher2_sub.id };
            const response = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);
            expect(response.status).toBe(404);
        });

        it('should return 400 if substitute teacher ID is invalid or not a teacher', async () => {
            const payload = { timetableSlotId: weeklySlot.id, substituteTeacherId: adminUser.id }; // Admin is not a teacher
            const response = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);
            expect(response.status).toBe(400);
            expect(response.body.message).toContain('is not a valid substitute teacher');
        });

        it('should return 400 if original teacher tries to substitute their own slot', async () => {
            const payload = { timetableSlotId: weeklySlot.id, substituteTeacherId: teacher3_original.id }; // teacher3 is original
            const response = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);
            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Teacher cannot be assigned as a substitute for their own original slot.');
        });

        it('should return 409 if substitute teacher has a conflict', async () => {
            // Assign teacher2_sub to dateSpecificSlot first
            await prisma.timetableSlot.update({
                where: { id: dateSpecificSlot.id }, data: { substituteTeacherId: teacher2_sub.id }
            });

            // Try to assign teacher2_sub to another slot (weeklySlot) that overlaps with dateSpecificSlot
            // if dateSpecificSlot's date happens to be a Monday (same day as weeklySlot)
            // This test setup is tricky; ensure specificDateForTest is NOT a Monday or ensure times don't overlap.
            // For simplicity, let's create a guaranteed conflict for teacher2_sub:
            const conflictingSlot = await prisma.timetableSlot.create({
                data: {
                    dayOfWeek: dateSpecificSlot.dayOfWeek, startTime: dateSpecificSlot.startTime, endTime: dateSpecificSlot.endTime,
                    currentClass: 'ConflictClass', subject: 'ConflictSub', date: dateSpecificSlot.date,
                    teacherId: teacher2_sub.id // teacher2_sub is the main teacher here
                }
            });

            const payload = { timetableSlotId: weeklySlot.id, substituteTeacherId: teacher2_sub.id };
            const response = await request(app)
                .post('/api/admin/substitute') // Trying to assign teacher2_sub to weeklySlot
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);

            // This will only conflict if weeklySlot's day (Monday) happens to be the same day as dateSpecificSlot's date
            // AND their times overlap. The conflict check needs to be robust.
            // The current conflict check in controller looks for existing slots for the sub.
            // If dateSpecificSlot (where teacher2_sub is now subbing) date matches weeklySlot's dayOfWeek AND time overlaps, it will conflict.
            // Let's make dateSpecificSlot a Monday 09:00-10:00 for a direct clash with weeklySlot
            const mondayDate = new Date(); // Find next Monday
            while (mondayDate.getDay() !== 1) { mondayDate.setDate(mondayDate.getDate() + 1); }
            const mondayDateUTC = new Date(Date.UTC(mondayDate.getUTCFullYear(), mondayDate.getUTCMonth(), mondayDate.getUTCDate()));


            await prisma.timetableSlot.update({
                where: { id: dateSpecificSlot.id }, data: {
                    date: mondayDateUTC, dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '10:00',
                    teacherId: null, // Original teacher not relevant for this conflict test point
                    substituteTeacherId: teacher2_sub.id // teacher2_sub is substituting here
                }
            });


            const payloadForConflict = { timetableSlotId: weeklySlot.id, substituteTeacherId: teacher2_sub.id };
            // weeklySlot is Mon 09:00-10:00. teacher2_sub is now subbing another Mon 09:00-10:00 slot.

            const conflictResponse = await request(app)
                .post('/api/admin/substitute')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payloadForConflict);

            expect(conflictResponse.status).toBe(409);
            expect(conflictResponse.body.message).toContain('Substitute teacher conflict');

            await prisma.timetableSlot.delete({ where: { id: conflictingSlot.id } }); // Clean up
        });
    });

    describe('POST /api/admin/substitute/clear (Clear Substitute)', () => {
        it('should clear an assigned substitute teacher from a slot', async () => {
            // Assign first
            await prisma.timetableSlot.update({ where: { id: dateSpecificSlot.id }, data: { substituteTeacherId: teacher2_sub.id } });

            const payload = { timetableSlotId: dateSpecificSlot.id };
            const response = await request(app)
                .post('/api/admin/substitute/clear')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(payload);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Substitute teacher cleared successfully.');
            expect(response.body.slot.substituteTeacherId).toBeNull();
            expect(response.body.slot.substituteTeacher).toBeNull();
        });
    });


    describe('GET /api/teacher/timetable (Teacher View with Substitutions)', () => {
        beforeEach(async () => {
            await prisma.timetableSlot.deleteMany({}); // Clean slate for each test in this describe
            // Original teacher: teacher1, Substitute: teacher2_sub
            // Case 1: teacher1's slot, subbed by teacher2_sub
            await prisma.timetableSlot.create({
                data: {
                    dayOfWeek: DayOfWeek.TUESDAY, startTime: '10:00', endTime: '11:00', currentClass: 'ClassA', subject: 'Subbed Subject',
                    teacherId: teacher1.id, substituteTeacherId: teacher2_sub.id, date: null
                }
            });
            // Case 2: teacher1's slot, not subbed
            await prisma.timetableSlot.create({
                data: {
                    dayOfWeek: DayOfWeek.TUESDAY, startTime: '11:00', endTime: '12:00', currentClass: 'ClassB', subject: 'Regular Subject',
                    teacherId: teacher1.id, substituteTeacherId: null, date: null
                }
            });
            // Case 3: teacher2_sub is the original teacher for a slot
            await prisma.timetableSlot.create({
                data: {
                    dayOfWeek: DayOfWeek.WEDNESDAY, startTime: '09:00', endTime: '10:00', currentClass: 'ClassC', subject: 'Sub Original Subject',
                    teacherId: teacher2_sub.id, substituteTeacherId: null, date: null
                }
            });
        });

        it('should show original teacher their regular slot if not substituted', async () => {
            const response = await request(app)
                .get('/api/teacher/timetable')
                .set('Authorization', `Bearer ${teacher1AuthToken}`); // teacher1

            expect(response.status).toBe(200);
            const regularSlot = response.body.find((s: any) => s.subject === 'Regular Subject');
            expect(regularSlot).toBeDefined();
            expect(regularSlot.isSubstituteAssignment).toBe(false);
            expect(regularSlot.teachingTeacherName).toBe(teacher1.name);
        });

        it('should NOT show original teacher a slot if it is substituted by someone else', async () => {
            const response = await request(app)
                .get('/api/teacher/timetable')
                .set('Authorization', `Bearer ${teacher1AuthToken}`); // teacher1

            expect(response.status).toBe(200);
            const subbedOutSlot = response.body.find((s: any) => s.subject === 'Subbed Subject');
            expect(subbedOutSlot).toBeUndefined(); // teacher1 should not see it in their "teaching" list
        });

        it('should show substitute teacher the slot they are substituting for', async () => {
            const response = await request(app)
                .get('/api/teacher/timetable')
                .set('Authorization', `Bearer ${teacher2AuthToken}`); // teacher2_sub

            expect(response.status).toBe(200);
            const subSlot = response.body.find((s: any) => s.subject === 'Subbed Subject');
            expect(subSlot).toBeDefined();
            expect(subSlot.isSubstituteAssignment).toBe(true);
            expect(subSlot.originalTeacherName).toBe(teacher1.name);
            expect(subSlot.teachingTeacherName).toBe(teacher2_sub.name);

            const subOriginalSlot = response.body.find((s: any) => s.subject === 'Sub Original Subject');
            expect(subOriginalSlot).toBeDefined();
            expect(subOriginalSlot.isSubstituteAssignment).toBe(false);
            expect(subOriginalSlot.teachingTeacherName).toBe(teacher2_sub.name);
        });

        it('teacher timetable respects date query with substitutions', async () => {
            await prisma.timetableSlot.deleteMany({});
            const specificDate = '2024-12-02'; // A Monday
            const specificDateObj = new Date(Date.UTC(2024, 11, 2));
            const day = getDayOfWeekFromDate(specificDateObj);

            // Slot for teacher1 on this specific date, subbed by teacher2_sub
            await prisma.timetableSlot.create({
                data: { date: specificDateObj, dayOfWeek: day, startTime: '09:00', endTime: '10:00', currentClass: 'C1', subject: 'S1_ALT_SUBBED', teacherId: teacher1.id, substituteTeacherId: teacher2_sub.id }
            });
            // Regular weekly slot for teacher1 on Mondays (should be ignored if date query matches)
            await prisma.timetableSlot.create({
                data: { date: null, dayOfWeek: DayOfWeek.MONDAY, startTime: '11:00', endTime: '12:00', currentClass: 'C2', subject: 'S1_REG_MON', teacherId: teacher1.id, substituteTeacherId: null }
            });

            // Teacher 1's view for the specific date (should see nothing as their slot is subbed)
            const t1Response = await request(app)
                .get(`/api/teacher/timetable?date=${specificDate}`)
                .set('Authorization', `Bearer ${teacher1AuthToken}`);
            expect(t1Response.status).toBe(200);
            expect(t1Response.body.length).toBe(0);

            // Teacher 2's (substitute) view for the specific date
            const t2Response = await request(app)
                .get(`/api/teacher/timetable?date=${specificDate}`)
                .set('Authorization', `Bearer ${teacher2AuthToken}`);
            expect(t2Response.status).toBe(200);
            expect(t2Response.body.length).toBe(1);
            expect(t2Response.body[0].subject).toBe('S1_ALT_SUBBED');
            expect(t2Response.body[0].isSubstituteAssignment).toBe(true);
        });
    });
});

// Helper function needed in this test file too
const getDayOfWeekFromDate = (date: Date): DayOfWeek => {
    const dayIndex = date.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
    const days: DayOfWeek[] = [DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY];
    return days[dayIndex];
};
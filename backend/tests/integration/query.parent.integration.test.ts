// tests/integration/query.parent.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, QueryStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { notificationService } from '@/lib/notification.service';

// Mock verifyOtp to always return true for tests
jest.mock('@/lib/auth.utils', () => ({
    ...jest.requireActual('@/lib/auth.utils'),
    verifyOtp: jest.fn().mockReturnValue(true),
}));

const createAndSendNotificationSpy = jest.spyOn(notificationService, 'createAndSendNotification');

// Variable to store captured OTP
let capturedOtp: string | null = null;

// Mock console.log to capture OTP
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
    const logStr = args.join(' ');
    if (logStr.includes('OTP for')) {
        capturedOtp = logStr.match(/\d{6}/)?.[0] || null;
    }
    originalConsoleLog(...args);
};

describe('Parent Query API Endpoints (/api/queries)', () => {
    let parentUser: any, student: any, teacherUser: any;
    let parentToken: string;

    beforeAll(async () => {
        await prisma.query.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        // Create users
        parentUser = await prisma.user.create({
            data: {
                name: 'Query Parent',
                phone: 'queryparent@example.com',
                role: Role.PARENT,
                passwordHash: await hashPassword('password123')
            }
        });

        teacherUser = await prisma.user.create({
            data: {
                name: 'Query Teacher',
                phone: 'queryteacher@example.com',
                role: Role.TEACHER,
                passwordHash: await hashPassword('password123')
            }
        });

        // Create student
        student = await prisma.student.create({
            data: {
                name: 'Query Student',
                admissionNumber: `QS${Date.now()}`,
                currentClass: 'Grade 5',
                parentId: parentUser.id
            }
        });

        // Create timetable slot for auto-assignment
        await prisma.timetableSlot.create({
            data: {
                dayOfWeek: 'MONDAY',
                startTime: "09:00",
                endTime: "10:00",
                currentClass: student.currentClass,
                subject: "TestSubject",
                teacherId: teacherUser.id
            }
        });

        // Get parent token using OTP flow
        const requestOtpResponse = await request(app)
            .post('/api/auth/parent-login')
            .send({ phone: 'queryparent@example.com' });
        expect(requestOtpResponse.status).toBe(200);

        // Use the captured OTP
        if (!capturedOtp) {
            throw new Error('Failed to capture OTP from logs');
        }

        const verifyOtpResponse = await request(app)
            .post('/api/auth/verify-otp')
            .send({ phone: 'queryparent@example.com', otp: capturedOtp });
        expect(verifyOtpResponse.status).toBe(200);
        parentToken = verifyOtpResponse.body.token;
    });

    beforeEach(() => {
        createAndSendNotificationSpy.mockClear();
        capturedOtp = null;
    });

    afterAll(async () => {
        await prisma.query.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
        console.log = originalConsoleLog;
    });

    describe('POST /api/queries', () => {
        it('should allow parent to create a query for their student', async () => {
            const queryData = {
                studentId: student.id,
                subject: 'Test Query',
                message: 'This is a test query'
            };

            const response = await request(app)
                .post('/api/queries')
                .set('Authorization', `Bearer ${parentToken}`)
                .send(queryData);

            expect(response.status).toBe(201);
            expect(response.body.subject).toBe(queryData.subject);
            expect(response.body.message).toBe(queryData.message);
            expect(response.body.parentId).toBe(parentUser.id);
            expect(response.body.studentId).toBe(student.id);
            expect(response.body.assignedToId).toBe(teacherUser.id); // Auto-assigned to teacher

            // Verify notification was sent to assigned teacher
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: teacherUser.id,
                type: 'QUERY_ASSIGNED',
                context: expect.objectContaining({
                    querySubject: queryData.subject,
                    studentName: student.name
                })
            }));
        });

        it('should return 400 if required fields are missing', async () => {
            const response = await request(app)
                .post('/api/queries')
                .set('Authorization', `Bearer ${parentToken}`)
                .send({ subject: 'Test Query' }); // Missing message and studentId

            expect(response.status).toBe(400);
        });

        it('should return 403 if parent tries to create query for another student', async () => {
            // Create another student with different parent
            const otherParent = await prisma.user.create({
                data: {
                    name: 'Other Parent',
                    phone: 'otherparent@example.com',
                    role: Role.PARENT,
                    passwordHash: await hashPassword('password123')
                }
            });

            const otherStudent = await prisma.student.create({
                data: {
                    name: 'Other Student',
                    admissionNumber: `OS${Date.now()}`,
                    currentClass: 'Grade 5',
                    parentId: otherParent.id
                }
            });

            const response = await request(app)
                .post('/api/queries')
                .set('Authorization', `Bearer ${parentToken}`)
                .send({
                    studentId: otherStudent.id,
                    subject: 'Test Query',
                    message: 'This is a test query'
                });

            expect(response.status).toBe(403);
        });
    });

    describe('GET /api/queries', () => {
        it('should allow parent to list their queries', async () => {
            const response = await request(app)
                .get('/api/queries')
                .set('Authorization', `Bearer ${parentToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            // The query we created in the previous test should be here
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0].parentId).toBe(parentUser.id);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app)
                .get('/api/queries');

            expect(response.status).toBe(401);
        });
    });
});

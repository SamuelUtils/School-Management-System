// tests/integration/query.staff.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, QueryStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { notificationService } from '@/lib/notification.service';
import { QueryUpdatePayload } from '@/models/query.types';

const createAndSendNotificationSpy = jest.spyOn(notificationService, 'createAndSendNotification');

// Variable to store captured OTP
let capturedOtp: string | null = null;

// Mock console.log to capture OTP
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('OTP for')) {
        const match = message.match(/OTP for .+: (\d+)/);
        if (match) {
            capturedOtp = match[1];
            originalConsoleLog('Captured OTP:', capturedOtp); // Debug log
        }
    }
    originalConsoleLog.apply(console, args);
};

describe('Query Staff API Endpoints (/api/queries)', () => {
    let adminUser: any, teacherUser: any, parentUser: any, student: any;
    let adminToken: string, teacherToken: string;
    let query: any;

    beforeAll(async () => {
        await prisma.query.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        // Create users
        adminUser = await prisma.user.create({
            data: {
                name: 'Query Admin',
                phone: 'queryadmin@example.com',
                role: Role.ADMIN,
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

        parentUser = await prisma.user.create({
            data: {
                name: 'Query Parent',
                phone: 'queryparent@example.com',
                role: Role.PARENT,
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

        // Create query
        query = await prisma.query.create({
            data: {
                subject: 'Test Query',
                message: 'This is a test query',
                parentId: parentUser.id,
                studentId: student.id,
                assignedToId: teacherUser.id,
                status: QueryStatus.OPEN
            }
        });

        // Generate tokens
        const adminLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({ phone: 'queryadmin@example.com', password: 'password123' });
        adminToken = adminLoginResponse.body.token;

        const teacherLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({ phone: 'queryteacher@example.com', password: 'password123' });
        teacherToken = teacherLoginResponse.body.token;
    });

    beforeEach(() => {
        createAndSendNotificationSpy.mockClear();
    });

    afterAll(async () => {
        await prisma.query.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
        // Restore original console.log
        console.log = originalConsoleLog;
    });

    describe('GET /api/queries/assigned', () => {
        it('should return queries assigned to the logged-in staff member', async () => {
            const response = await request(app)
                .get('/api/queries/assigned')
                .set('Authorization', `Bearer ${teacherToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0].id).toBe(query.id);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app)
                .get('/api/queries/assigned');

            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /api/queries/:id', () => {
        it('should allow staff to update query status and add resolution', async () => {
            const updateData = {
                status: QueryStatus.RESOLVED,
                resolutionComment: 'Issue has been resolved'
            };

            const response = await request(app)
                .patch(`/api/queries/${query.id}`)
                .set('Authorization', `Bearer ${teacherToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(QueryStatus.RESOLVED);
            expect(response.body.resolutionComment).toBe(updateData.resolutionComment);

            // Verify notification was sent to parent
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: parentUser.id,
                type: 'QUERY_RESOLVED',
                context: expect.objectContaining({
                    querySubject: 'Test Query',
                    studentName: student.name
                })
            }));
        });

        it('should allow admin to reassign query', async () => {
            // Create a new teacher for reassignment
            const newTeacher = await prisma.user.create({
                data: {
                    name: 'New Query Teacher',
                    phone: 'newqueryteacher@example.com',
                    role: Role.TEACHER,
                    passwordHash: await hashPassword('password123')
                }
            });

            const updateData = {
                assignedToId: newTeacher.id
            };

            const response = await request(app)
                .patch(`/api/queries/${query.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body.assignedToId).toBe(newTeacher.id);

            // Verify notification was sent to new teacher
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: newTeacher.id,
                type: 'QUERY_ASSIGNED',
                context: expect.objectContaining({
                    querySubject: 'Test Query',
                    studentName: student.name
                })
            }));
        });

        it('should return 404 if query does not exist', async () => {
            const response = await request(app)
                .patch('/api/queries/nonexistent-id')
                .set('Authorization', `Bearer ${teacherToken}`)
                .send({ status: QueryStatus.IN_PROGRESS });

            expect(response.status).toBe(404);
        });

        it('should return 403 if non-assigned staff tries to update', async () => {
            // Create another teacher
            const otherTeacher = await prisma.user.create({
                data: {
                    name: 'Other Teacher',
                    phone: 'otherteacher@example.com',
                    role: Role.TEACHER,
                    passwordHash: await hashPassword('password123')
                }
            });

            const otherTeacherToken = await request(app)
                .post('/api/auth/login')
                .send({ phone: 'otherteacher@example.com', password: 'password123' })
                .then((res) => res.body.token);

            const response = await request(app)
                .patch(`/api/queries/${query.id}`)
                .set('Authorization', `Bearer ${otherTeacherToken}`)
                .send({ status: QueryStatus.IN_PROGRESS });

            expect(response.status).toBe(403);
        });
    });
});
// tests/integration/notification.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, QueryStatus } from '@prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { generateToken } from '@/lib/auth.utils';
// No need to spy on notificationService here, as we are testing the outcome (DB records)
// and the API endpoints that read these records.

describe('Notification API Endpoints (/api/notifications)', () => {
    let user1: any, user2: any;
    let token1: string, token2: string;
    let notificationForUser1: any, notificationForUser2: any;

    beforeAll(async () => {
        await prisma.notification.deleteMany({});
        await prisma.user.deleteMany({});

        const pass = 'password123';
        user1 = await prisma.user.create({ data: { name: 'Notify User One', phone: 'notify1@example.com', role: Role.TEACHER, passwordHash: await hashPassword(pass) } });
        user2 = await prisma.user.create({ data: { name: 'Notify User Two', phone: 'notify2@example.com', role: Role.PARENT, passwordHash: await hashPassword(pass) } });

        token1 = generateToken(user1);
        token2 = generateToken(user2);

        // Create some notifications directly in DB for testing GET and PATCH
        notificationForUser1 = await prisma.notification.create({
            data: { userId: user1.id, type: 'NEW_MESSAGE', content: 'Test unread message for User 1', read: false, relatedId: 'msg123' }
        });
        await prisma.notification.create({
            data: { userId: user1.id, type: 'QUERY_ASSIGNED', content: 'Test read query for User 1', read: true, relatedId: 'query456' }
        });
        notificationForUser2 = await prisma.notification.create({
            data: { userId: user2.id, type: 'FEE_ASSIGNED', content: 'Test unread fee for User 2', read: false }
        });
    });

    afterAll(async () => {
        await prisma.notification.deleteMany({});
        await prisma.user.deleteMany({});
    });

    describe('GET /api/notifications', () => {
        it('should retrieve notifications for the authenticated user (user1) with unread count', async () => {
            const response = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${token1}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.notifications)).toBe(true);
            expect(response.body.notifications.length).toBe(2); // User 1 has 2 notifications
            expect(response.body.unreadCount).toBe(1); // One is unread

            const unreadMsg = response.body.notifications.find((n: any) => n.id === notificationForUser1.id);
            expect(unreadMsg).toBeDefined();
            expect(unreadMsg.read).toBe(false);
            expect(unreadMsg.content).toBe('Test unread message for User 1');
        });

        it('should retrieve notifications for user2', async () => {
            const response = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${token2}`);
            expect(response.status).toBe(200);
            expect(response.body.notifications.length).toBe(1);
            expect(response.body.unreadCount).toBe(1);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app).get('/api/notifications');
            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /api/notifications/:id/read', () => {
        it('should allow user to mark their own notification as read', async () => {
            expect(notificationForUser1.read).toBe(false); // Pre-condition

            const response = await request(app)
                .patch(`/api/notifications/${notificationForUser1.id}/read`)
                .set('Authorization', `Bearer ${token1}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(notificationForUser1.id);
            expect(response.body.read).toBe(true);

            const dbNotification = await prisma.notification.findUnique({ where: { id: notificationForUser1.id } });
            expect(dbNotification?.read).toBe(true);
        });

        it('should return 200 if notification is already read', async () => {
            // notificationForUser1 is now read from previous test.
            const response = await request(app)
                .patch(`/api/notifications/${notificationForUser1.id}/read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Notification already marked as read.');
        });

        it('should return 403 Forbidden if user tries to mark another user notification as read', async () => {
            // user1 tries to mark user2's notification
            const response = await request(app)
                .patch(`/api/notifications/${notificationForUser2.id}/read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(403);
        });

        it('should return 404 if notification ID does not exist', async () => {
            const response = await request(app)
                .patch(`/api/notifications/non-existent-notification-id/read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(404);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app).patch(`/api/notifications/${notificationForUser1.id}/read`);
            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /api/notifications/mark-all-read', () => {
        beforeEach(async () => { // Ensure user1 has some unread notifications
            await prisma.notification.updateMany({ where: { userId: user1.id }, data: { read: false } });
        });

        it('should allow user to mark all their unread notifications as read', async () => {
            let initialUnread = await prisma.notification.count({ where: { userId: user1.id, read: false } });
            expect(initialUnread).toBeGreaterThan(0);

            const response = await request(app)
                .patch(`/api/notifications/mark-all-read`)
                .set('Authorization', `Bearer ${token1}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toContain(`${initialUnread} notifications marked as read`);

            const finalUnread = await prisma.notification.count({ where: { userId: user1.id, read: false } });
            expect(finalUnread).toBe(0);
        });

        it('should do nothing if user has no unread notifications', async () => {
            await prisma.notification.updateMany({ where: { userId: user1.id }, data: { read: true } }); // Mark all as read
            const response = await request(app)
                .patch(`/api/notifications/mark-all-read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(200);
            expect(response.body.message).toContain(`0 notifications marked as read`);
        });
    });

    // --- Tests for Notification Creation (Trigger Points) ---
    // These tests will re-use existing POST endpoints and check if a Notification record is created.
    // Requires the NotificationService to be correctly creating DB entries.
    describe('Notification Creation on Events', () => {
        let testSender: any, testRecipient: any, testStudentForQuery: any, testParentForQuery: any, testQueryAssignedTeacher: any;
        let tokenSender: string, tokenParentForQuery: string, tokenQueryAssignedTeacher: string;

        beforeAll(async () => {
            // Create specific users for these event tests to avoid interference
            testSender = await prisma.user.create({ data: { name: 'Notif Sender', phone: 'nsender@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
            testRecipient = await prisma.user.create({ data: { name: 'Notif Recipient', phone: 'nrecipient@example.com', role: Role.PARENT, passwordHash: await hashPassword('pass') } });
            testParentForQuery = await prisma.user.create({ data: { name: 'Notif Query Parent', phone: 'nqparent@example.com', role: Role.PARENT, passwordHash: await hashPassword('pass') } });
            testStudentForQuery = await prisma.student.create({ data: { name: 'Notif Query Student', admissionNumber: `NQS${Date.now()}`, currentClass: 'G3', parentId: testParentForQuery.id } });
            testQueryAssignedTeacher = await prisma.user.create({ data: { name: 'Notif Query Teacher', phone: 'nqteacher@example.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });

            // Setup a timetable slot for the student's class to ensure a teacher is found for query assignment
            await prisma.timetableSlot.create({
                data: {
                    dayOfWeek: 'MONDAY', startTime: "09:00", endTime: "10:00",
                    currentClass: testStudentForQuery.currentClass, subject: "TestSub", teacherId: testQueryAssignedTeacher.id
                }
            });

            tokenSender = generateToken(testSender);
            tokenParentForQuery = generateToken(testParentForQuery);
            tokenQueryAssignedTeacher = generateToken(testQueryAssignedTeacher);
        });

        it('should create a NEW_MESSAGE notification when a message is sent', async () => {
            const payload = { recipientId: testRecipient.id, content: 'Test notification message' };
            await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${tokenSender}`)
                .send(payload);

            const notification = await prisma.notification.findFirst({
                where: { userId: testRecipient.id, type: 'NEW_MESSAGE' },
                orderBy: { createdAt: 'desc' }
            });
            expect(notification).not.toBeNull();
            expect(notification?.content).toContain(`You have a new message from ${testSender.name}`);
            expect(notification?.read).toBe(false);
        });

        it('should create a QUERY_ASSIGNED notification when a query is assigned', async () => {
            const queryPayload = { studentId: testStudentForQuery.id, subject: 'Notification Test Query', message: 'Testing query assignment notification.' };
            const queryResponse = await request(app)
                .post('/api/queries')
                .set('Authorization', `Bearer ${tokenParentForQuery}`)
                .send(queryPayload);
            expect(queryResponse.status).toBe(201); // Query created and auto-assigned

            const notification = await prisma.notification.findFirst({
                where: { userId: testQueryAssignedTeacher.id, type: 'QUERY_ASSIGNED', relatedId: queryResponse.body.id },
                orderBy: { createdAt: 'desc' }
            });
            expect(notification).not.toBeNull();
            expect(notification?.content).toContain(`Query "Notification Test Query" (Student: ${testStudentForQuery.name}) has been assigned to you`);
        });

        it('should create a QUERY_RESOLVED notification when a query is resolved', async () => {
            // 1. Create a query
            const query = await prisma.query.create({
                data: { parentId: testParentForQuery.id, studentId: testStudentForQuery.id, subject: 'Resolve Me', message: 'Pls resolve', assignedToId: testQueryAssignedTeacher.id }
            });

            // 2. Admin/Teacher resolves it
            const resolvePayload = { status: QueryStatus.RESOLVED, resolutionComment: 'Issue sorted.' };
            await request(app)
                .patch(`/api/queries/${query.id}`)
                .set('Authorization', `Bearer ${tokenQueryAssignedTeacher}`) // Teacher resolves
                .send(resolvePayload);

            const notification = await prisma.notification.findFirst({
                where: { userId: testParentForQuery.id, type: 'QUERY_RESOLVED', relatedId: query.id },
                orderBy: { createdAt: 'desc' }
            });
            expect(notification).not.toBeNull();
            expect(notification?.content).toContain(`Your query "Resolve Me" (Student: ${testStudentForQuery.name}) has been resolved`);
            expect(notification?.content).toContain('Issue sorted.');
        });
    });
});
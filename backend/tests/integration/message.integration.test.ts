// tests/integration/message.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role } from '.prisma/client';
import { hashPassword, verifyOtp } from '@/lib/auth.utils';
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
    const message = args[0];
    if (typeof message === 'string' && message.includes('OTP for')) {
        const match = message.match(/OTP for .+: (\d+)/);
        if (match) {
            capturedOtp = match[1];
        }
    }
    originalConsoleLog.apply(console, args);
};

describe('Messaging API Endpoints (/api/messages)', () => {
    let user1: any, user2: any, user3: any;
    let token1: string, token2: string, token3: string;

    beforeAll(async () => {
        // Delete in correct order to respect foreign key constraints
        await prisma.message.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        const pass = 'password123';
        user1 = await prisma.user.create({
            data: { name: 'User One', phone: 'msguser1@example.com', role: Role.TEACHER, passwordHash: await hashPassword(pass) },
        });
        user2 = await prisma.user.create({
            data: { name: 'User Two', phone: 'msguser2@example.com', role: Role.PARENT, passwordHash: await hashPassword(pass) },
        });
        user3 = await prisma.user.create({
            data: { name: 'User Three', phone: 'msguser3@example.com', role: Role.ADMIN, passwordHash: await hashPassword(pass) },
        });

        const login = async (phone: string, role: Role) => {
            if (role === Role.PARENT) {
                // For parents, use OTP flow
                const sendOtpResponse = await request(app).post('/api/auth/parent-login').send({ phone });
                expect(sendOtpResponse.status).toBe(200);

                // Use the captured OTP
                if (!capturedOtp) {
                    throw new Error('Failed to capture OTP from logs');
                }
                const verifyOtpResponse = await request(app).post('/api/auth/verify-otp').send({ phone, otp: capturedOtp });
                expect(verifyOtpResponse.status).toBe(200);
                return verifyOtpResponse.body.token;
            } else {
                // For admin/teacher, use password login
                const response = await request(app).post('/api/auth/login').send({ phone, password: pass });
                expect(response.status).toBe(200);
                return response.body.token;
            }
        };

        token1 = await login(user1.phone, user1.role);
        token2 = await login(user2.phone, user2.role);
        token3 = await login(user3.phone, user3.role);

        if (!token1 || !token2 || !token3) {
            throw new Error("Failed to obtain tokens for messaging tests");
        }
    });

    afterAll(async () => {
        // Delete in correct order to respect foreign key constraints
        await prisma.message.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
        // Restore original console.log
        console.log = originalConsoleLog;
    });

    beforeEach(() => {
        createAndSendNotificationSpy.mockClear();
        // Reset capturedOtp before each test
        capturedOtp = null;
    });

    describe('POST /api/messages (Send Message)', () => {
        it('should allow an authenticated user to send a message to another user', async () => {
            const payload = { recipientId: user2.id, content: 'Hello User Two!' };
            const response = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${token1}`) // User1 sends to User2
                .send(payload);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.content).toBe(payload.content);
            expect(response.body.sender.id).toBe(user1.id);
            expect(response.body.recipient.id).toBe(user2.id);
            expect(response.body.read).toBe(false);

            // Verify notification
            expect(createAndSendNotificationSpy).toHaveBeenCalledTimes(1);
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith({
                userIdToNotify: user2.id,
                type: 'NEW_MESSAGE',
                relatedId: response.body.id,
                context: {
                    senderName: user1.name
                }
            });

            const dbMessage = await prisma.message.findUnique({ where: { id: response.body.id } });
            expect(dbMessage).not.toBeNull();
            expect(dbMessage?.senderId).toBe(user1.id);
            expect(dbMessage?.recipientId).toBe(user2.id);
        });

        it('should return 400 if recipientId or content is missing', async () => {
            const res1 = await request(app).post('/api/messages').set('Authorization', `Bearer ${token1}`).send({ content: 'Hi' });
            expect(res1.status).toBe(400);
            const res2 = await request(app).post('/api/messages').set('Authorization', `Bearer ${token1}`).send({ recipientId: user2.id });
            expect(res2.status).toBe(400);
        });

        it('should return 404 if recipient user does not exist', async () => {
            const payload = { recipientId: 'non-existent-user-id', content: 'Wont reach' };
            const response = await request(app).post('/api/messages').set('Authorization', `Bearer ${token1}`).send(payload);
            expect(response.status).toBe(404);
        });

        it('should return 400 if sender tries to send message to themselves', async () => {
            const payload = { recipientId: user1.id, content: 'Talking to myself' };
            const response = await request(app).post('/api/messages').set('Authorization', `Bearer ${token1}`).send(payload);
            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Cannot send a message to yourself.');
        });


        it('should return 401 if sender is not authenticated', async () => {
            const payload = { recipientId: user2.id, content: 'Anonymous' };
            const response = await request(app).post('/api/messages').send(payload);
            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/messages/inbox (Get Inbox)', () => {
        let msg1to2: any, msg2to1: any, msg1to3_unread: any;

        beforeAll(async () => { // Create some messages for inbox tests
            await prisma.message.deleteMany({}); // Clear messages before this suite's specific setup
            msg1to2 = await prisma.message.create({ data: { senderId: user1.id, recipientId: user2.id, content: 'Msg 1 from U1 to U2', read: true } });
            msg2to1 = await prisma.message.create({ data: { senderId: user2.id, recipientId: user1.id, content: 'Msg 2 from U2 to U1 (unread for U1)', read: false } });
            msg1to3_unread = await prisma.message.create({ data: { senderId: user1.id, recipientId: user3.id, content: 'Msg 3 from U1 to U3 (unread for U3)', read: false } });
            // A message not involving user1
            await prisma.message.create({ data: { senderId: user2.id, recipientId: user3.id, content: 'Msg between U2 and U3', read: false } });
        });

        it("should retrieve user1's messages (sent and received) and unread count", async () => {
            const response = await request(app)
                .get('/api/messages/inbox')
                .set('Authorization', `Bearer ${token1}`); // User1's inbox

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.messages)).toBe(true);
            // User1 sent msg1to2, received msg2to1, sent msg1to3_unread. Total 3.
            expect(response.body.messages.length).toBe(3);
            expect(response.body.unreadCount).toBe(1); // msg2to1 is unread for user1

            const receivedMsg = response.body.messages.find((m: any) => m.id === msg2to1.id);
            expect(receivedMsg).toBeDefined();
            expect(receivedMsg.direction).toBe('received');
            expect(receivedMsg.read).toBe(false); // As per DB for this recipient

            const sentMsg = response.body.messages.find((m: any) => m.id === msg1to2.id);
            expect(sentMsg).toBeDefined();
            expect(sentMsg.direction).toBe('sent');
            expect(sentMsg.read).toBe(true); // Sent messages shown as 'read' by sender in this view logic
        });

        it("should retrieve user2's messages and unread count", async () => {
            const response = await request(app)
                .get('/api/messages/inbox')
                .set('Authorization', `Bearer ${token2}`); // User2's inbox
            expect(response.status).toBe(200);
            // User2 received msg1to2, sent msg2to1, sent msg to U3. Total 3.
            expect(response.body.messages.length).toBe(3);
            expect(response.body.unreadCount).toBe(0); // msg1to2 was read:true by U1, no unread for U2
        });


        it('should return 401 if not authenticated', async () => {
            const response = await request(app).get('/api/messages/inbox');
            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /api/messages/:messageId/read (Mark Message As Read)', () => {
        let messageToUser1: any;

        beforeEach(async () => { // Recreate an unread message for user1 before each test in this block
            await prisma.message.deleteMany({ where: { recipientId: user1.id } }); // Clear previous specific messages
            messageToUser1 = await prisma.message.create({
                data: { senderId: user2.id, recipientId: user1.id, content: 'Mark me as read!', read: false }
            });
        });

        it('should allow recipient to mark their message as read', async () => {
            const response = await request(app)
                .patch(`/api/messages/${messageToUser1.id}/read`)
                .set('Authorization', `Bearer ${token1}`); // User1 is recipient

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(messageToUser1.id);
            expect(response.body.read).toBe(true);

            const dbMessage = await prisma.message.findUnique({ where: { id: messageToUser1.id } });
            expect(dbMessage?.read).toBe(true);
        });

        it('should return 200 if message is already read (no change)', async () => {
            await prisma.message.update({ where: { id: messageToUser1.id }, data: { read: true } }); // Mark as read first
            const response = await request(app)
                .patch(`/api/messages/${messageToUser1.id}/read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Message was already read.');
        });


        it('should return 403 Forbidden if non-recipient tries to mark as read', async () => {
            const response = await request(app)
                .patch(`/api/messages/${messageToUser1.id}/read`)
                .set('Authorization', `Bearer ${token2}`); // User2 is sender, not recipient
            expect(response.status).toBe(403);
        });

        it('should return 404 if message does not exist', async () => {
            const response = await request(app)
                .patch(`/api/messages/non-existent-message-id/read`)
                .set('Authorization', `Bearer ${token1}`);
            expect(response.status).toBe(404);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app).patch(`/api/messages/${messageToUser1.id}/read`);
            expect(response.status).toBe(401);
        });
    });
});
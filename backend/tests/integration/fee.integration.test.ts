// tests/integration/fee.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role } from '@prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { notificationService } from '@/lib/notification.service';

const createAndSendNotificationSpy = jest.spyOn(notificationService, 'createAndSendNotification');

describe('Fee API Endpoints (/api/admin/fees)', () => {
    let adminUser: any, parentUser: any, student: any, feeCategory: any;
    let adminToken: string;

    beforeAll(async () => {
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        // Create users
        adminUser = await prisma.user.create({
            data: {
                name: 'Fee Admin',
                phone: 'feeadmin@example.com',
                role: Role.ADMIN,
                passwordHash: await hashPassword('password123')
            }
        });

        parentUser = await prisma.user.create({
            data: {
                name: 'Fee Parent',
                phone: 'feeparent@example.com',
                role: Role.PARENT,
                passwordHash: await hashPassword('password123')
            }
        });

        // Create student
        student = await prisma.student.create({
            data: {
                name: 'Fee Student',
                admissionNumber: `FS${Date.now()}`,
                currentClass: 'Grade 5',
                parentId: parentUser.id
            }
        });

        // Create fee category
        feeCategory = await prisma.feeCategory.create({
            data: {
                name: 'Test Fee Category',
                description: 'For fee tests',
                baseAmount: 1000
            }
        });

        // Get admin token
        const adminLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({ phone: 'feeadmin@example.com', password: 'password123' });
        adminToken = adminLoginResponse.body.token;
    });

    beforeEach(() => {
        createAndSendNotificationSpy.mockClear();
    });

    afterAll(async () => {
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
    });

    describe('POST /api/admin/fees/assign', () => {
        it('should assign a fee to a student', async () => {
            const feeData = {
                studentId: student.id,
                feeCategoryId: feeCategory.id,
                assignedAmount: 1000,
                discountAmount: 0
            };

            const response = await request(app)
                .post('/api/admin/fees/assign')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(feeData);

            expect(response.status).toBe(201);
            expect(response.body.studentId).toBe(student.id);
            expect(response.body.feeCategoryId).toBe(feeCategory.id);
            expect(response.body.assignedAmount).toBe(feeData.assignedAmount);
            expect(response.body.discountAmount).toBe(feeData.discountAmount);

            // Verify notification was sent to parent
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: parentUser.id,
                type: 'FEE_ASSIGNED',
                context: expect.objectContaining({
                    studentName: student.name,
                    feeCategoryName: feeCategory.name,
                    amount: feeData.assignedAmount
                })
            }));
        });

        it('should return 400 if required fields are missing', async () => {
            const response = await request(app)
                .post('/api/admin/fees/assign')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    studentId: student.id,
                    // Missing feeCategoryId and other required fields
                });

            expect(response.status).toBe(400);
        });

        it('should return 404 if student does not exist', async () => {
            const response = await request(app)
                .post('/api/admin/fees/assign')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    studentId: 'non-existent-id',
                    feeCategoryId: feeCategory.id,
                    assignedAmount: 1000,
                    discountAmount: 0
                });

            expect(response.status).toBe(404);
        });

        it('should return 404 if fee category does not exist', async () => {
            const response = await request(app)
                .post('/api/admin/fees/assign')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    studentId: student.id,
                    feeCategoryId: 'non-existent-id',
                    assignedAmount: 1000,
                    discountAmount: 0
                });

            expect(response.status).toBe(404);
        });

        it('should return 401 if not authenticated', async () => {
            const response = await request(app)
                .post('/api/admin/fees/assign')
                .send({
                    studentId: student.id,
                    feeCategoryId: feeCategory.id,
                    assignedAmount: 1000,
                    discountAmount: 0
                });

            expect(response.status).toBe(401);
        });
    });
});
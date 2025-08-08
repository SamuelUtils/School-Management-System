import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, PaymentMode } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';
import { notificationService } from '@/lib/notification.service';

const createAndSendNotificationSpy = jest.spyOn(notificationService, 'createAndSendNotification');

describe('Overdue Fee Reminder API (/api/admin/fee-reminder)', () => {
    let adminUser: any, student1: any, feeCat1: any, studentFee1Cat1: any, parentUser: any;
    let adminToken: string;

    beforeAll(async () => {
        await prisma.feePayment.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        // Create Admin User and get token
        adminUser = await prisma.user.create({
            data: { name: 'Reminder Admin', phone: 'reminder_admin@example.com', role: Role.ADMIN, passwordHash: await hashPassword('pass') },
        });
        const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: 'pass' });
        adminToken = adminLoginRes.body.token;

        // Create Parent User
        parentUser = await prisma.user.create({
            data: { name: 'Reminder Parent', phone: 'reminder_parent@example.com', role: Role.PARENT, passwordHash: await hashPassword('pass') }
        });

        // Create Student linked to Parent
        student1 = await prisma.student.create({
            data: {
                name: 'Reminder Student',
                currentClass: "1",
                section: 'REM_S',
                admissionNumber: 'REM001',
                parentId: parentUser.id
            }
        });

        feeCat1 = await prisma.feeCategory.create({ data: { name: 'Overdue Test Fee', baseAmount: 500 } });
        studentFee1Cat1 = await prisma.studentFee.create({
            data: { studentId: student1.id, feeCategoryId: feeCat1.id, assignedAmount: 500, assignedById: adminUser.id }
        });
        // No payment made, so it's "overdue" for this test's purpose
    });

    afterAll(async () => {
        await prisma.feePayment.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
    });

    beforeEach(() => {
        createAndSendNotificationSpy.mockClear();
    });

    it('should send an overdue reminder notification for an unpaid fee', async () => {
        const response = await request(app)
            .post(`/api/admin/fee-reminder/${studentFee1Cat1.id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Overdue fee reminder sent.');

        expect(createAndSendNotificationSpy).toHaveBeenCalledTimes(1);
        expect(createAndSendNotificationSpy).toHaveBeenCalledWith({
            userIdToNotify: parentUser.id,
            type: 'FEE_OVERDUE_REMINDER',
            relatedId: studentFee1Cat1.id,
            context: {
                studentName: student1.name,
                feeCategoryName: feeCat1.name,
                amount: 500 // The due amount
            }
        });
    });

    it('should return 400 if fee is already fully paid', async () => {
        // Make a full payment
        await prisma.feePayment.create({
            data: { studentFeeId: studentFee1Cat1.id, studentId: student1.id, paidAmount: 500, paymentDate: new Date(), mode: PaymentMode.CASH, receiptNumber: 'REM001', createdById: adminUser.id }
        });

        const response = await request(app)
            .post(`/api/admin/fee-reminder/${studentFee1Cat1.id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('This fee is already fully paid or has no dues.');
        expect(createAndSendNotificationSpy).not.toHaveBeenCalled();

        // Clean up payment for other tests or next run
        await prisma.feePayment.deleteMany({ where: { studentFeeId: studentFee1Cat1.id } });
    });

    it('should return 404 if studentFeeId is not found', async () => {
        const response = await request(app)
            .post(`/api/admin/fee-reminder/non-existent-id`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(response.status).toBe(404);
    });
});
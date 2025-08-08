// tests/integration/payment.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, PaymentMode } from '@prisma/client';
import { hashPassword } from '@/lib/auth.utils';// To spy on
import { generateReceiptNumber } from '@/lib/receipt.utils';
import { notificationService } from '@/lib/notification.service';

const createAndSendNotificationSpy = jest.spyOn(notificationService, 'createAndSendNotification');
const generateReceiptNumberSpy = jest.spyOn(require('@/lib/receipt.utils'), 'generateReceiptNumber');

// Variable to store the actual OTP
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

// Set up mock implementation to return predictable values for each test
beforeEach(() => {
    createAndSendNotificationSpy.mockClear();
    generateReceiptNumberSpy.mockClear();
    // Default mock implementation for generateReceiptNumber
    let counter = 0;
    generateReceiptNumberSpy.mockImplementation(async () => {
        counter++;
        return `TEST-RECEIPT-${String(counter).padStart(4, '0')}`;
    });
});

describe('Fee Payment API Endpoints (/api/admin/payment)', () => {
    let adminUser: any, student1: any, feeCategory1: any, studentFee1: any, parentUser: any;
    const adminPassword = 'PaymentAdminPassword123!';
    let adminAuthToken: string;
    let parentToken: string;

    beforeAll(async () => {
        // Clear relevant tables in order
        await prisma.feePayment.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});

        // Create Admin User and get token
        adminUser = await prisma.user.create({
            data: { name: 'Payment Admin', phone: 'payment_admin@example.com', role: Role.ADMIN, passwordHash: await hashPassword(adminPassword) },
        });
        const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: adminPassword });
        adminAuthToken = adminLoginRes.body.token;
        if (!adminAuthToken) throw new Error('Failed to get admin token for payment tests');

        // Create Parent (for notification)
        const parentPassword = "parentpass";
        parentUser = await prisma.user.create({
            data: { name: "Payment Parent", phone: "paymentparent@example.com", role: Role.PARENT, passwordHash: await hashPassword(parentPassword) }
        });

        // Get parent token using OTP flow
        const sendOtpRes = await request(app).post('/api/auth/parent-login').send({ phone: parentUser.phone });
        expect(sendOtpRes.status).toBe(200);

        // Wait a moment to ensure the OTP is captured
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that we captured the OTP
        expect(capturedOtp).not.toBeNull();
        console.log('Using captured OTP:', capturedOtp);

        const verifyOtpRes = await request(app).post('/api/auth/verify-otp').send({
            phone: parentUser.phone,
            otp: capturedOtp
        });
        expect(verifyOtpRes.status).toBe(200);
        parentToken = verifyOtpRes.body.token;
        if (!parentToken) throw new Error('Failed to get parent token for payment tests');

        // Create Student
        student1 = await prisma.student.create({
            data: { name: 'Payment Student One', currentClass: "1", section: 'PAY_SCH', parentId: parentUser.id, admissionNumber: 'PAY001' }
        });

        // Create Fee Category
        feeCategory1 = await prisma.feeCategory.create({
            data: { name: 'Term 1 Fees', baseAmount: 1500 }
        });

        // Assign Fee to Student (StudentFee record)
        studentFee1 = await prisma.studentFee.create({
            data: {
                studentId: student1.id,
                feeCategoryId: feeCategory1.id,
                assignedAmount: 1500, // Base amount, no discount for this setup
                discountAmount: 0,
                assignedById: adminUser.id,
            }
        });

        // Create initial payment for testing
        await prisma.feePayment.create({
            data: {
                studentFeeId: studentFee1.id,
                studentId: student1.id,
                paidAmount: 100,
                paymentDate: new Date(),
                mode: PaymentMode.ONLINE_TRANSFER,
                receiptNumber: 'TEST-RECEIPT-INIT-1',
                createdById: adminUser.id
            }
        });
    });

    afterAll(async () => {
        await prisma.feePayment.deleteMany({});
        await prisma.studentFee.deleteMany({});
        await prisma.feeCategory.deleteMany({});
        await prisma.student.deleteMany({});
        await prisma.user.deleteMany({});
    });

    describe('POST /api/admin/payment (Record Fee Payment)', () => {
        const getTodayDateString = () => new Date().toISOString().split('T')[0];

        it('should record a valid fee payment and send PAYMENT_RECEIVED notification', async () => {
            const paymentData = {
                studentFeeId: studentFee1.id,
                paidAmount: 500,
                paymentDate: getTodayDateString(),
                mode: PaymentMode.ONLINE_TRANSFER,
                notes: 'Test payment'
            };

            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);

            expect(response.status).toBe(201);
            expect(createAndSendNotificationSpy).toHaveBeenCalledTimes(1);
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: parentUser.id,
                type: 'PAYMENT_RECEIVED',
                context: expect.objectContaining({
                    studentName: student1.name,
                    feeCategoryName: feeCategory1.name,
                    amount: paymentData.paidAmount,
                    receiptNumber: response.body.receiptNumber
                })
            }));
        });

        it('should record a valid fee payment successfully', async () => {
            const paymentData = {
                studentFeeId: studentFee1.id,
                paidAmount: 500,
                paymentDate: getTodayDateString(),
                mode: PaymentMode.ONLINE_TRANSFER,
                notes: 'Test payment'
            };

            // Mock receipt number generation for predictability if needed, or let it run
            const mockReceipt = "FEERCT-2024-0001";
            generateReceiptNumberSpy.mockResolvedValueOnce(mockReceipt);

            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.studentFeeId).toBe(studentFee1.id);
            expect(response.body.studentId).toBe(student1.id);
            expect(response.body.paidAmount).toBe(paymentData.paidAmount);
            expect(response.body.mode).toBe(paymentData.mode);
            expect(response.body.receiptNumber).toMatch(/^FEERCT-\d{4}-\d{4}$/); // Check format
            expect(response.body.createdById).toBe(adminUser.id); // Audit check

            // Check notification
            expect(createAndSendNotificationSpy).toHaveBeenCalledTimes(1);
            expect(createAndSendNotificationSpy).toHaveBeenCalledWith(expect.objectContaining({
                userIdToNotify: parentUser.id,
                type: 'PAYMENT_RECEIVED',
                context: expect.objectContaining({
                    studentName: student1.name,
                    feeCategoryName: feeCategory1.name,
                    amount: paymentData.paidAmount,
                    receiptNumber: response.body.receiptNumber
                })
            }));

            // Verify in DB
            const dbPayment = await prisma.feePayment.findUnique({ where: { id: response.body.id } });
            expect(dbPayment).not.toBeNull();
            expect(dbPayment?.paidAmount).toBe(paymentData.paidAmount);
        });

        it('should record a full payment correctly', async () => {
            await prisma.feePayment.deleteMany({ where: { studentFeeId: studentFee1.id } }); // Clear previous payments for this studentFee

            const paymentData = {
                studentFeeId: studentFee1.id,
                paidAmount: studentFee1.assignedAmount, // Full amount
                paymentDate: getTodayDateString(),
                mode: PaymentMode.CASH,
            };
            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);
            expect(response.status).toBe(201);
            expect(response.body.paidAmount).toBe(studentFee1.assignedAmount);
        });


        it('should reject payment if paidAmount exceeds due amount', async () => {
            await prisma.feePayment.deleteMany({ where: { studentFeeId: studentFee1.id } }); // Clear previous

            // First partial payment
            await prisma.feePayment.create({
                data: {
                    studentFeeId: studentFee1.id,
                    studentId: student1.id,
                    paidAmount: 1000,
                    paymentDate: new Date(),
                    mode: PaymentMode.CASH,
                    receiptNumber: 'TEST-RECEIPT-PARTIAL-1', // Fixed test receipt number
                    createdById: adminUser.id
                }
            });
            // Due amount is now 1500 - 1000 = 500

            const paymentData = {
                studentFeeId: studentFee1.id,
                paidAmount: 600, // Exceeds due amount of 500
                paymentDate: getTodayDateString(),
                mode: PaymentMode.CARD,
            };
            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Paid amount (600) exceeds due amount (500.00)');
        });

        it('should return 400 if studentFeeId is invalid or not found', async () => {
            const paymentData = { studentFeeId: 'non-existent-studentfee-id', paidAmount: 100, paymentDate: getTodayDateString(), mode: PaymentMode.CASH };
            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);
            expect(response.status).toBe(404); // Or 400 depending on how controller handles it first
            expect(response.body.message).toBe('StudentFee record not found. Ensure fee is assigned to student first.');
        });

        it('should return 400 if paidAmount is zero or negative', async () => {
            const paymentData = { studentFeeId: studentFee1.id, paidAmount: 0, paymentDate: getTodayDateString(), mode: PaymentMode.CASH };
            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData);
            expect(response.status).toBe(400);
            expect(response.body.message).toContain('positive Paid Amount');
        });


        it('should ensure unique receipt number generation (conceptual test)', async () => {
            // Mock generateReceiptNumber to always return the same number for this test
            generateReceiptNumberSpy.mockImplementation(async () => 'DUPLICATE-RECEIPT-001');

            const paymentData1 = { studentFeeId: studentFee1.id, paidAmount: 10, paymentDate: getTodayDateString(), mode: PaymentMode.CASH };

            // First payment should succeed
            const response1 = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData1);

            expect(response1.status).toBe(201);

            // Second payment should fail due to duplicate receipt
            const paymentData2 = { studentFeeId: studentFee1.id, paidAmount: 20, paymentDate: getTodayDateString(), mode: PaymentMode.CASH };
            const response2 = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send(paymentData2);

            expect(response2.status).toBe(500);
            expect(response2.body.message).toBe('Could not generate a unique receipt number. Please try again.');

            // Clean up
            await prisma.feePayment.deleteMany({ where: { receiptNumber: 'DUPLICATE-RECEIPT-001' } });
        });


        it('should return 403 Forbidden if non-admin tries to record payment', async () => {
            const nonAdminUser = await prisma.user.create({ data: { name: 'NonAdminPay', phone: 'nonadminpay@fee.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
            const nonAdminLogin = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: 'pass' });
            const nonAdminToken = nonAdminLogin.body.token;

            const paymentData = { studentFeeId: studentFee1.id, paidAmount: 50, paymentDate: getTodayDateString(), mode: PaymentMode.CASH };
            const response = await request(app)
                .post('/api/admin/payment')
                .set('Authorization', `Bearer ${nonAdminToken}`)
                .send(paymentData);
            expect(response.status).toBe(403);
            await prisma.user.delete({ where: { id: nonAdminUser.id } });
        });
    });

    describe('GET /api/admin/payment/:studentId (List Student Payments)', () => {
        it('should list all payments for a given student', async () => {
            const response = await request(app)
                .get(`/api/admin/payment/${student1.id}`)
                .set('Authorization', `Bearer ${adminAuthToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(1);
            expect(response.body[0].studentId).toBe(student1.id);
            expect(response.body[0]).toHaveProperty('studentFee');
            expect(response.body[0].studentFee.feeCategory.name).toBe(feeCategory1.name);
        });

        it('should return empty array if student has no payments', async () => {
            const newStudent = await prisma.student.create({ data: { name: "No Payment Student", currentClass: "1", section: "NPS", admissionNumber: 'PAY002' } });
            const response = await request(app)
                .get(`/api/admin/payment/${newStudent.id}`)
                .set('Authorization', `Bearer ${adminAuthToken}`);
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(0);
            await prisma.student.delete({ where: { id: newStudent.id } });
        });

        it('should return 404 if student not found', async () => {
            const response = await request(app)
                .get(`/api/admin/payment/non-existent-student-id`)
                .set('Authorization', `Bearer ${adminAuthToken}`);
            expect(response.status).toBe(404);
        });

        it('should return 403 Forbidden if non-admin tries to list payments', async () => {
            const nonAdminUser = await prisma.user.create({ data: { name: 'NonAdminListPay', phone: 'nonadminlistpay@fee.com', role: Role.TEACHER, passwordHash: await hashPassword('pass') } });
            const nonAdminLogin = await request(app).post('/api/auth/login').send({ phone: nonAdminUser.phone, password: 'pass' });
            const nonAdminToken = nonAdminLogin.body.token;

            const response = await request(app)
                .get(`/api/admin/payment/${student1.id}`)
                .set('Authorization', `Bearer ${nonAdminToken}`);
            expect(response.status).toBe(403);
            await prisma.user.delete({ where: { id: nonAdminUser.id } });
        });
    });
});
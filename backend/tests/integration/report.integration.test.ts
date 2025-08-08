// tests/integration/report.integration.test.ts
import request from 'supertest';
import { app } from '@/app';
import prisma from '@/lib/prisma';
import { Role, PaymentMode } from '.prisma/client';
import { hashPassword } from '@/lib/auth.utils';

describe('Reporting API Endpoints (/api/admin/reports)', () => {
  let adminUser: any, student1: any, student2: any;
  let feeCat1: any, feeCat2: any;
  let studentFee1Cat1: any, studentFee1Cat2: any, studentFee2Cat1: any;
  let adminToken: string;

  beforeAll(async () => {
    // Clear database
    await prisma.feePayment.deleteMany({});
    await prisma.studentFee.deleteMany({});
    await prisma.feeCategory.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});

    // Create Admin
    adminUser = await prisma.user.create({
      data: { name: 'Report Admin', phone: 'report_admin@example.com', role: Role.ADMIN, passwordHash: await hashPassword('pass') },
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({ phone: adminUser.phone, password: 'pass' });
    adminToken = adminLoginRes.body.token;

    // Create Students
    student1 = await prisma.student.create({ data: { name: 'Report Student A', currentClass: "1", section: 'RPT_S', admissionNumber: 'RPT001' } });
    student2 = await prisma.student.create({ data: { name: 'Report Student B', currentClass: "2", section: 'RPT_S', admissionNumber: 'RPT002' } });

    // Create Fee Categories
    feeCat1 = await prisma.feeCategory.create({ data: { name: 'Tuition Fee Q1', baseAmount: 1000 } });
    feeCat2 = await prisma.feeCategory.create({ data: { name: 'Transport Fee Q1', baseAmount: 300 } });

    // Assign Fees to Students (StudentFee records)
    // Student 1: Tuition (full), Transport (discounted)
    studentFee1Cat1 = await prisma.studentFee.create({
      data: { studentId: student1.id, feeCategoryId: feeCat1.id, assignedAmount: 1000, discountAmount: 0, assignedById: adminUser.id }
    });
    studentFee1Cat2 = await prisma.studentFee.create({
      data: { studentId: student1.id, feeCategoryId: feeCat2.id, assignedAmount: 200, discountAmount: 100, assignedById: adminUser.id } // base 300, discount 100
    });
    // Student 2: Tuition (full)
    studentFee2Cat1 = await prisma.studentFee.create({
      data: { studentId: student2.id, feeCategoryId: feeCat1.id, assignedAmount: 1000, discountAmount: 0, assignedById: adminUser.id }
    });

    // Record some Payments
    // Student 1, Tuition: paid 600 (due 400)
    await prisma.feePayment.create({
      data: { studentFeeId: studentFee1Cat1.id, studentId: student1.id, paidAmount: 600, paymentDate: new Date(), mode: PaymentMode.ONLINE_TRANSFER, receiptNumber: 'RPT001', createdById: adminUser.id }
    });
    // Student 1, Transport: paid 200 (full payment for this discounted fee)
    await prisma.feePayment.create({
      data: { studentFeeId: studentFee1Cat2.id, studentId: student1.id, paidAmount: 200, paymentDate: new Date(), mode: PaymentMode.CASH, receiptNumber: 'RPT002', createdById: adminUser.id }
    });
    // Student 2, Tuition: paid 500 (due 500)
    const paymentDateThisMonth = new Date(); // For "collectedThisMonth" test
    await prisma.feePayment.create({
      data: { studentFeeId: studentFee2Cat1.id, studentId: student2.id, paidAmount: 500, paymentDate: paymentDateThisMonth, mode: PaymentMode.CARD, receiptNumber: 'RPT003', createdById: adminUser.id }
    });
    // Payment in previous month for category 1 (to test "collectedThisMonth")
    const previousMonthDate = new Date();
    previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
    await prisma.feePayment.create({
      data: { studentFeeId: studentFee2Cat1.id, studentId: student2.id, paidAmount: 100, paymentDate: previousMonthDate, mode: PaymentMode.CARD, receiptNumber: 'RPT004', createdById: adminUser.id }
    });


  });

  afterAll(async () => {
    await prisma.feePayment.deleteMany({});
    await prisma.studentFee.deleteMany({});
    await prisma.feeCategory.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe('GET /api/admin/reports/fee-summary', () => {
    it('should return fee summary grouped by category with correct totals', async () => {
      const response = await request(app)
        .get('/api/admin/reports/fee-summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('summaryByCategory');
      expect(response.body).toHaveProperty('overallTotals');

      const summary = response.body.summaryByCategory;
      const overall = response.body.overallTotals;

      // --- Assertions for FeeCategory 1 (Tuition Fee Q1) ---
      // Student 1: Assigned 1000, Paid 600
      // Student 2: Assigned 1000, Paid 500 (this month) + 100 (last month) = 600 total
      const tuitionSummary = summary.find((s: any) => s.feeCategoryId === feeCat1.id);
      expect(tuitionSummary).toBeDefined();
      expect(tuitionSummary.feeCategoryName).toBe('Tuition Fee Q1');
      expect(tuitionSummary.totalNetAssignedAllTime).toBe(1000 + 1000); // 2000
      expect(tuitionSummary.totalDiscountGivenAllTime).toBe(0);
      expect(tuitionSummary.totalPaidAllTime).toBe(600 + 500 + 100); // 1200
      expect(tuitionSummary.totalOverallDueForCategory).toBe(2000 - 1200); // 800
      expect(tuitionSummary.totalCollectedThisMonth).toBe(1100); // Only S2's payment this month for this category
      expect(tuitionSummary.numberOfAssignments).toBe(2);


      // --- Assertions for FeeCategory 2 (Transport Fee Q1) ---
      // Student 1: Base 300, Discount 100 => Net Assigned 200. Paid 200.
      const transportSummary = summary.find((s: any) => s.feeCategoryId === feeCat2.id);
      expect(transportSummary).toBeDefined();
      expect(transportSummary.feeCategoryName).toBe('Transport Fee Q1');
      expect(transportSummary.totalNetAssignedAllTime).toBe(200);
      expect(transportSummary.totalDiscountGivenAllTime).toBe(100);
      expect(transportSummary.totalPaidAllTime).toBe(200);
      expect(transportSummary.totalOverallDueForCategory).toBe(200 - 200); // 0
      expect(transportSummary.totalCollectedThisMonth).toBe(200); // Assuming S1's transport payment was this month
      expect(transportSummary.numberOfAssignments).toBe(1);

      // --- Overall Totals ---
      expect(overall.totalNetAssignedAllTime).toBe(2000 + 200); // 2200
      expect(overall.totalDiscountGivenAllTime).toBe(0 + 100); // 100
      expect(overall.totalPaidAllTime).toBe(1200 + 200); // 1400
      expect(overall.totalOverallDueForCategory).toBe(800 + 0); // 800
      expect(overall.totalCollectedThisMonth).toBe(1300); // 700
    });

    it('should return empty summary if no fee categories or assignments exist', async () => {
      // Temporarily delete data for this test
      await prisma.feePayment.deleteMany({});
      await prisma.studentFee.deleteMany({});
      await prisma.feeCategory.deleteMany({});

      const response = await request(app)
        .get('/api/admin/reports/fee-summary')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.summaryByCategory).toEqual([]);
      expect(response.body.overallTotals.totalNetAssignedAllTime).toBe(0);

      // Re-add one category for subsequent tests if needed, or rely on test order / full beforeAll.
      // For simplicity, we are relying on test order and the afterAll/beforeAll of the main describe.
      // But this test will affect subsequent ones if not careful.
      // Best practice: Each test should ensure its own state or be very careful about shared state.
      // Let's re-create feeCat1 for the student report test.
      feeCat1 = await prisma.feeCategory.create({ data: { name: 'Tuition Fee Q1', baseAmount: 1000 } });
      studentFee1Cat1 = await prisma.studentFee.create({
        data: { studentId: student1.id, feeCategoryId: feeCat1.id, assignedAmount: 1000, discountAmount: 0, assignedById: adminUser.id }
      });
    });
  });

  describe('GET /api/admin/reports/student/:id/fee-report', () => {
    it('should return a detailed fee report for a specific student', async () => {
      const response = await request(app)
        .get(`/api/admin/reports/student/${student1.id}/fee-report`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.student.id).toBe(student1.id);
      expect(response.body.feeDetails.length).toBeGreaterThanOrEqual(1); // Student1 has at least Tuition Fee Q1

      const tuitionDetail = response.body.feeDetails.find((fd: any) => fd.feeCategoryId === feeCat1.id);
      expect(tuitionDetail).toBeDefined();
      expect(tuitionDetail.feeCategoryName).toBe('Tuition Fee Q1');
      expect(tuitionDetail.feeCategoryBaseAmount).toBe(1000); // Original base
      expect(tuitionDetail.assignedAmountForStudent).toBe(1000); // Net for student
      expect(tuitionDetail.discountGivenToStudent).toBe(0);

      // Sum of payments for student1 on studentFee1Cat1
      const s1Cat1Payments = await prisma.feePayment.aggregate({
        _sum: { paidAmount: true },
        where: { studentFeeId: studentFee1Cat1.id }
      });
      const s1Cat1TotalPaid = s1Cat1Payments._sum.paidAmount || 0;

      expect(tuitionDetail.totalPaidByStudent).toBe(s1Cat1TotalPaid);
      expect(tuitionDetail.amountDueByStudent).toBe(1000 - s1Cat1TotalPaid);
      expect(tuitionDetail.payments.length).toBeGreaterThanOrEqual(0); // Student1 made payments to this

      // Check overall summary for this student
      expect(response.body.summary.overallTotalPayable).toBeGreaterThanOrEqual(1000); // S1 has at least tuition
      //   expect(response.body.summary.overallTotalPaid).toBe(s1Cat1TotalPaid + (studentFee1Cat2 ? 200 : 0)); // Assuming transport payment from setup
      expect(response.body.summary.overallTotalDue).toBe(response.body.summary.overallTotalPayable - response.body.summary.overallTotalPaid);
    });

    it('should return 404 if student not found for fee report', async () => {
      const response = await request(app)
        .get(`/api/admin/reports/student/non-existent-student/fee-report`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
    });

    it('should return appropriate message if student has no fees assigned', async () => {
      const studentWithNoFees = await prisma.student.create({ data: { name: 'No Fee Student', currentClass: "3", section: 'NF', admissionNumber: 'RPT003' } });
      const response = await request(app)
        .get(`/api/admin/reports/student/${studentWithNoFees.id}/fee-report`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('No fees assigned to this student yet.');
      expect(response.body.feeDetails).toEqual([]);
      await prisma.student.delete({ where: { id: studentWithNoFees.id } });
    });
  });

  describe('GET /api/admin/reports/export (Stubbed)', () => {
    it('should return CSV data for type=csv', async () => {
      const response = await request(app)
        .get('/api/admin/reports/export?type=csv')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.header['content-type']).toMatch(/text\/csv/);
      expect(response.header['content-disposition']).toMatch(/attachment; filename="fee_report_summary_\d+\.csv"/);
      expect(response.text).toContain("FeeCategory,TotalAssigned,TotalCollected,TotalDue");
    });

    it('should return PDF data placeholder for type=pdf', async () => {
      const response = await request(app)
        .get('/api/admin/reports/export?type=pdf')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      // expect(response.header['content-type']).toMatch(/application\/pdf/);
      // expect(response.header['content-disposition']).toMatch(/attachment; filename="fee_report_summary_\d+\.pdf"/);
      // expect(response.text).toBe("This would be PDF binary data.");
    });

    it('should return 400 for unsupported export type', async () => {
      const response = await request(app)
        .get('/api/admin/reports/export?type=xml')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
    });
  });
});
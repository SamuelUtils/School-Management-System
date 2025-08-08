// src/routes/report.routes.ts
import { Router } from 'express';
import * as reportController from '@/controllers/report.controller';

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Report generation and management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FeeSummary:
 *       type: object
 *       properties:
 *         totalFees:
 *           type: number
 *           format: float
 *         collectedFees:
 *           type: number
 *           format: float
 *         pendingFees:
 *           type: number
 *           format: float
 *         totalStudents:
 *           type: integer
 *         studentsWithDues:
 *           type: integer
 *     StudentFeeReport:
 *       type: object
 *       properties:
 *         studentId:
 *           type: string
 *           format: uuid
 *         studentName:
 *           type: string
 *         totalFees:
 *           type: number
 *           format: float
 *         paidFees:
 *           type: number
 *           format: float
 *         pendingFees:
 *           type: number
 *           format: float
 *         payments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Payment'
 */

const router = Router();

/**
 * @swagger
 * /admin/reports/fee-summary:
 *   get:
 *     summary: Get overall fee collection summary
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report period
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report period
 *     responses:
 *       200:
 *         description: Fee summary report
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeeSummary'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.get('/fee-summary', reportController.getFeeSummaryReport);

/**
 * @swagger
 * /admin/reports/student/{id}/fee-report:
 *   get:
 *     summary: Get detailed fee report for a student
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Student fee report
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StudentFeeReport'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student not found
 */
router.get('/student/:id/fee-report', reportController.getStudentFeeReport);

/**
 * @swagger
 * /admin/reports/export:
 *   get:
 *     summary: Export fee report in CSV format
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report period
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report period
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [SUMMARY, DETAILED]
 *         description: Type of report to export
 *     responses:
 *       200:
 *         description: Fee report CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.get('/export', reportController.exportFeeReport);

export default router;
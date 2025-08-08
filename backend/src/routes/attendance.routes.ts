// src/routes/attendance.routes.ts
import { Router } from 'express';
import * as attendanceController from '@/controllers/attendance.controller';
// Middlewares (authenticate, authorize) will be applied in src/routes/index.ts

/**
 * @swagger
 * tags:
 *   name: Attendance
 *   description: Attendance management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Attendance:
 *       type: object
 *       required:
 *         - studentId
 *         - date
 *         - status
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           readOnly: true
 *         studentId:
 *           type: string
 *           format: uuid
 *         date:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [PRESENT, ABSENT, LATE]
 *         markedById:
 *           type: string
 *           format: uuid
 *           readOnly: true
 *         remarks:
 *           type: string
 *     AttendanceUpdate:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [PRESENT, ABSENT, LATE]
 *         remarks:
 *           type: string
 */

// Teacher routes (prefix /teacher will be added in main router)
export const teacherRouter = Router();

/**
 * @swagger
 * /teacher/attendance:
 *   post:
 *     summary: Mark attendance for students
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/Attendance'
 *     responses:
 *       201:
 *         description: Attendance marked successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a teacher
 */
teacherRouter.post('/', attendanceController.markAttendanceByTeacher);

// Admin routes (prefix /admin will be added in main router)
// Note: This route structure means PATCH /api/admin/attendance/:id
// If you want PATCH /api/attendance/:id controlled by admin, structure differently.
// For now, let's assume admin actions on attendance are under /admin/attendance

export const adminRouter = Router();

/**
 * @swagger
 * /admin/attendance/{id}:
 *   patch:
 *     summary: Update attendance record
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Attendance record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AttendanceUpdate'
 *     responses:
 *       200:
 *         description: Attendance updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Attendance'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Attendance record not found
 */
adminRouter.patch('/:id', attendanceController.updateAttendanceByAdmin);

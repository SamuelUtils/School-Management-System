// src/routes/teacher.routes.ts
import { Router } from 'express';
import * as teacherController from '@/controllers/teacher.controller';
// authenticate and authorize middlewares will be applied in src/routes/index.ts

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Teacher
 *   description: Teacher-specific operations
 */

/**
 * @swagger
 * /teacher/timetable:
 *   get:
 *     summary: Get teacher's timetable
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Specific date (YYYY-MM-DD) to get timetable for
 *     responses:
 *       200:
 *         description: Teacher's timetable
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/TimetableSlot'
 *                   - type: object
 *                     properties:
 *                       isSubstituteAssignment:
 *                         type: boolean
 *                       originalTeacherName:
 *                         type: string
 *                       teachingTeacherName:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not a teacher
 */
router.get('/timetable', teacherController.getTeacherTimetable);

export default router;
// src/routes/admin.routes.ts
import { Router } from 'express';
import * as adminController from '@/controllers/admin.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Administrative operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FeeCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         baseAmount:
 *           type: number
 *           format: float
 *     StudentFeeAssignment:
 *       type: object
 *       required:
 *         - studentId
 *         - feeCategoryId
 *       properties:
 *         studentId:
 *           type: string
 *           format: uuid
 *         feeCategoryId:
 *           type: string
 *           format: uuid
 *         discountAmount:
 *           type: number
 *           format: float
 *           default: 0
 *     TimetableSlot:
 *       type: object
 *       required:
 *         - dayOfWeek
 *         - startTime
 *         - endTime
 *         - currentClass
 *         - subject
 *       properties:
 *         dayOfWeek:
 *           type: string
 *           enum: [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY]
 *         startTime:
 *           type: string
 *           pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
 *           example: "09:00"
 *         endTime:
 *           type: string
 *           pattern: "^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
 *           example: "10:00"
 *         currentClass:
 *           type: string
 *         section:
 *           type: string
 *         subject:
 *           type: string
 *         teacherId:
 *           type: string
 *           format: uuid
 *     Parent:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
 *       properties:
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *     Student:
 *       type: object
 *       required:
 *         - name
 *         - dateOfBirth
 *         - class
 *       properties:
 *         name:
 *           type: string
 *         dateOfBirth:
 *           type: string
 *           format: date
 *         class:
 *           type: string
 *         section:
 *           type: string
 *         rollNumber:
 *           type: string
 *     ParentStudentMapping:
 *       type: object
 *       required:
 *         - parentId
 *         - studentId
 *       properties:
 *         parentId:
 *           type: string
 *           format: uuid
 *         studentId:
 *           type: string
 *           format: uuid
 *         relationship:
 *           type: string
 *           enum: [FATHER, MOTHER, GUARDIAN]
 *     Payment:
 *       type: object
 *       required:
 *         - studentId
 *         - amount
 *         - feeAssignmentId
 *       properties:
 *         studentId:
 *           type: string
 *           format: uuid
 *         amount:
 *           type: number
 *           format: float
 *         feeAssignmentId:
 *           type: string
 *           format: uuid
 *         paymentDate:
 *           type: string
 *           format: date
 *         paymentMethod:
 *           type: string
 *           enum: [CASH, BANK_TRANSFER, CHECK]
 *     AlternateTimetable:
 *       type: object
 *       required:
 *         - date
 *         - slots
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *         slots:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TimetableSlot'
 */

/**
 * @swagger
 * /admin/fees/category:
 *   get:
 *     summary: List all fee categories
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of fee categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FeeCategory'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.get('/fees/category', adminController.listFeeCategories);

/**
 * @swagger
 * /admin/fees/assign:
 *   post:
 *     summary: Assign fees to a student
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StudentFeeAssignment'
 *     responses:
 *       201:
 *         description: Fee assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 assignedAmount:
 *                   type: number
 *                   format: float
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student or fee category not found
 */
router.post('/fees/assign', adminController.assignFeeToStudent);

/**
 * @swagger
 * /admin/fee-reminder/{studentFeeId}:
 *   post:
 *     summary: Send fee reminder to parent
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentFeeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Student Fee ID
 *     responses:
 *       200:
 *         description: Reminder sent successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student fee record not found
 */
router.post('/fee-reminder/:studentFeeId', adminController.sendOverdueFeeReminder);

/**
 * @swagger
 * /admin/students/{id}/docs:
 *   get:
 *     summary: Get student documents
 *     tags: [Admin]
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
 *         description: Student documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student not found
 */
router.get('/students/:id/docs', adminController.getStudentDocuments);

/**
 * @swagger
 * /admin/timetable/{class}/{section}:
 *   get:
 *     summary: Get class timetable
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: class
 *         required: true
 *         schema:
 *           type: string
 *         description: Class name/number
 *       - in: path
 *         name: section
 *         required: false
 *         schema:
 *           type: string
 *         description: Section name
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Specific date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Class timetable
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TimetableSlot'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.get('/timetable/:class/:section?', adminController.getTimetableForClassSection);

/**
 * @swagger
 * /admin/substitute:
 *   post:
 *     summary: Assign substitute teacher
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - timetableSlotId
 *               - substituteTeacherId
 *             properties:
 *               timetableSlotId:
 *                 type: string
 *                 format: uuid
 *               substituteTeacherId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Substitute teacher assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 slot:
 *                   $ref: '#/components/schemas/TimetableSlot'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Timetable slot or teacher not found
 *       409:
 *         description: Teacher already has a conflicting slot
 */
router.post('/substitute', adminController.assignSubstituteTeacher);

/**
 * @swagger
 * /admin/parent:
 *   post:
 *     summary: Create a new parent
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Parent'
 *     responses:
 *       201:
 *         description: Parent created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.post('/parent', adminController.createParent);

/**
 * @swagger
 * /admin/student:
 *   post:
 *     summary: Create a new student
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Student'
 *     responses:
 *       201:
 *         description: Student created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.post('/student', adminController.createStudent);

/**
 * @swagger
 * /admin/student/map-parent:
 *   post:
 *     summary: Map a parent to a student
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParentStudentMapping'
 *     responses:
 *       200:
 *         description: Parent mapped to student successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Parent or student not found
 */
router.post('/student/map-parent', adminController.mapParentToStudent);

/**
 * @swagger
 * /admin/fees/category:
 *   post:
 *     summary: Create a new fee category
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FeeCategory'
 *     responses:
 *       201:
 *         description: Fee category created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.post('/fees/category', adminController.createFeeCategory);

/**
 * @swagger
 * /admin/payment:
 *   post:
 *     summary: Record a fee payment
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Payment'
 *     responses:
 *       201:
 *         description: Payment recorded successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student or fee assignment not found
 * 
 * /admin/payment/{studentId}:
 *   get:
 *     summary: Get payment history for a student
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Student ID
 *     responses:
 *       200:
 *         description: List of payments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student not found
 */
router.post('/payment', adminController.recordFeePayment);
router.get('/payment/:studentId', adminController.listStudentPayments);

/**
 * @swagger
 * /admin/students:
 *   post:
 *     summary: Create a new student with additional details
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Student'
 *     responses:
 *       201:
 *         description: Student created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *   get:
 *     summary: List all students
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: class
 *         schema:
 *           type: string
 *         description: Filter by class
 *       - in: query
 *         name: section
 *         schema:
 *           type: string
 *         description: Filter by section
 *     responses:
 *       200:
 *         description: List of students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Student'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.post('/students', adminController.createStudentViaAdmin);
router.get('/students', adminController.listStudents);

/**
 * @swagger
 * /admin/students/{id}/upload-docs:
 *   post:
 *     summary: Upload documents for a student
 *     tags: [Admin]
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Student not found
 */
router.post('/students/:id/upload-docs', adminController.uploadStudentDocuments);

/**
 * @swagger
 * /admin/timetable:
 *   post:
 *     summary: Create or update a timetable slot
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TimetableSlot'
 *     responses:
 *       200:
 *         description: Timetable slot created/updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       409:
 *         description: Time slot conflict
 */
router.post('/timetable', adminController.createOrUpdateTimetableSlot);

/**
 * @swagger
 * /admin/alternate-timetable:
 *   post:
 *     summary: Set alternate timetable for a specific date
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AlternateTimetable'
 *     responses:
 *       200:
 *         description: Alternate timetable set successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 */
router.post('/alternate-timetable', adminController.setAlternateTimetable);

/**
 * @swagger
 * /admin/substitute/clear:
 *   post:
 *     summary: Clear substitute teacher assignment
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - timetableSlotId
 *             properties:
 *               timetableSlotId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Substitute teacher assignment cleared successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an admin
 *       404:
 *         description: Timetable slot not found
 */
router.post('/substitute/clear', adminController.clearSubstituteTeacher);

export default router;
// src/routes/query.routes.ts
import { Router } from 'express';
import * as queryController from '@/controllers/query.controller';
import { authorize } from '@/middlewares/auth.middleware';
import { Role } from '@prisma/client';
// Middlewares (authenticate, authorize for PARENT role) will be applied in src/routes/index.ts

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Queries
 *   description: Query management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     QueryCreateRequest:
 *       type: object
 *       required:
 *         - studentId
 *         - subject
 *         - message
 *       properties:
 *         studentId:
 *           type: string
 *           format: uuid
 *           description: ID of the student the query is about
 *         subject:
 *           type: string
 *           description: Subject or title of the query
 *         message:
 *           type: string
 *           description: Detailed message or question
 *     QueryResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         subject:
 *           type: string
 *         message:
 *           type: string
 *         status:
 *           type: string
 *           enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
 *         resolutionComment:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         parent:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         student:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *         assignedTo:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             role:
 *               type: string
 */

/**
 * @swagger
 * /queries:
 *   post:
 *     summary: Create a new query
 *     tags: [Queries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QueryCreateRequest'
 *     responses:
 *       201:
 *         description: Query created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueryResponse'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a parent or not the parent of the specified student
 */
router.post('/', authorize(Role.PARENT), queryController.createParentQuery);

/**
 * @swagger
 * /queries:
 *   get:
 *     summary: List queries for the current user
 *     tags: [Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
 *         description: Filter by query status
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by student ID
 *     responses:
 *       200:
 *         description: List of queries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QueryResponse'
 *       401:
 *         description: Unauthorized
 */
router.get('/', queryController.listUserQueries);

/**
 * @swagger
 * /queries/assigned:
 *   get:
 *     summary: List queries assigned to the current teacher/admin
 *     tags: [Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
 *         description: Filter by query status
 *     responses:
 *       200:
 *         description: List of assigned queries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QueryResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a teacher or admin
 */
router.get('/assigned', authorize(Role.TEACHER, Role.ADMIN), queryController.listUserQueries);

/**
 * @swagger
 * /queries/{id}:
 *   patch:
 *     summary: Update a query (status, resolution, or assignment)
 *     tags: [Queries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Query ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]
 *               resolutionComment:
 *                 type: string
 *               assignedToId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of teacher/admin to assign (admin only)
 *     responses:
 *       200:
 *         description: Query updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueryResponse'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User cannot modify this query
 *       404:
 *         description: Query not found
 */
router.patch('/:id', authorize(Role.TEACHER, Role.ADMIN), queryController.updateQuery);

// Example for listing queries (not fully implemented in controller yet)
// router.get('/', queryController.listUserQueries);

export default router;
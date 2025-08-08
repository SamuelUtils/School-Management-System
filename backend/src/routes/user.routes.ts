import { Router } from 'express';
import * as userController from '@/controllers/user.controller';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management operations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - role
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           readOnly: true
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           format: password
 *           writeOnly: true
 *         role:
 *           type: string
 *           enum: [ADMIN, TEACHER, PARENT]
 *         name:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *           readOnly: true
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           readOnly: true
 */

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Email already exists
 */
router.post('/', userController.createUser);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Can only access own profile unless admin
 *       404:
 *         description: User not found
 */
router.get('/:id', userController.getUserById);

export default router;
// src/routes/message.routes.ts
import { Router } from 'express';
import * as messageController from '@/controllers/message.controller';
// authenticate middleware will be applied in src/routes/index.ts

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Message management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MessageCreateRequest:
 *       type: object
 *       required:
 *         - recipientId
 *         - content
 *       properties:
 *         recipientId:
 *           type: string
 *           format: uuid
 *           description: ID of the message recipient
 *         content:
 *           type: string
 *           description: Message content
 *     MessageResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         content:
 *           type: string
 *         read:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         sender:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             role:
 *               type: string
 *         recipient:
 *           type: object
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
 * /messages:
 *   post:
 *     summary: Send a new message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MessageCreateRequest'
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Cannot send message to this recipient
 *       404:
 *         description: Recipient not found
 */
router.post('/', messageController.sendMessage);

/**
 * @swagger
 * /messages/inbox:
 *   get:
 *     summary: List received messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: senderId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by sender ID
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MessageResponse'
 *                 unreadCount:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get('/inbox', messageController.listMessages);

/**
 * @swagger
 * /messages/{id}/read:
 *   patch:
 *     summary: Mark a message as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Message ID
 *     responses:
 *       200:
 *         description: Message marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not the recipient of the message
 *       404:
 *         description: Message not found
 */
router.patch('/:id/read', messageController.markMessageAsRead);

export default router;
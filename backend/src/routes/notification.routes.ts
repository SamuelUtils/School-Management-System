// src/routes/notification.routes.ts
import { Router } from 'express';
import * as notificationController from '@/controllers/notification.controller';
// authenticate middleware will be applied in src/routes/index.ts

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [QUERY_ASSIGNED, QUERY_UPDATED, QUERY_RESOLVED, FEE_REMINDER]
 *         content:
 *           type: string
 *         read:
 *           type: boolean
 *         relatedId:
 *           type: string
 *           format: uuid
 *           description: ID of the related entity (e.g., query ID, fee ID)
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user's notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: read
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [QUERY_ASSIGNED, QUERY_UPDATED, QUERY_RESOLVED, FEE_REMINDER]
 *         description: Filter by notification type
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Unauthorized
 */
router.get('/', notificationController.listNotifications);

/**
 * @swagger
 * /notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All notifications marked as read"
 *                 count:
 *                   type: number
 *                   description: Number of notifications marked as read
 *       401:
 *         description: Unauthorized
 */
router.patch('/mark-all-read', notificationController.markAllNotificationsAsRead);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Notification marked as read"
 *                 notification:
 *                   $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not the owner of the notification
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', notificationController.markNotificationAsRead);

export default router;
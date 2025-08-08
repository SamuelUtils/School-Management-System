// src/controllers/notification.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { User } from '@prisma/client';
import { JwtPayload } from 'jsonwebtoken';

// GET /notifications - List notifications for the logged-in user
export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user as JwtPayload; // Authenticated user

        const notifications = await prisma.notification.findMany({
            where: {
                userId: user.id,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 20, // Implement pagination for real app
        });

        const unreadCount = await prisma.notification.count({
            where: {
                userId: user.id,
                read: false,
            }
        });

        return res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        next(error);
    }
};

// PATCH /notifications/:id/read - Mark a specific notification as read
export const markNotificationAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user as JwtPayload; // Authenticated user
        const { id: notificationId } = req.params;

        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found.' });
        }

        // Security: User can only mark their own notifications as read
        if (notification.userId !== user.id) {
            return res.status(403).json({ message: 'Forbidden: You can only update your own notifications.' });
        }

        if (notification.read) {
            return res.status(200).json({ message: 'Notification already marked as read.', ...notification });
        }

        const updatedNotification = await prisma.notification.update({
            where: { id: notificationId },
            data: { read: true },
        });

        return res.status(200).json(updatedNotification);
    } catch (error) {
        next(error);
    }
};

// Optional: PATCH /notifications/mark-all-read
export const markAllNotificationsAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user as JwtPayload;
        const result = await prisma.notification.updateMany({
            where: {
                userId: user.id,
                read: false,
            },
            data: {
                read: true,
            }
        });
        return res.status(200).json({ message: `${result.count} notifications marked as read.` });
    } catch (error) {
        next(error);
    }
};
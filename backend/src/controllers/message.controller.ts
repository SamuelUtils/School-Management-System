// src/controllers/message.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '@/lib/prisma';
import { notificationService } from '@/lib/notification.service';
import { Role } from '@prisma/client';

// POST /api/messages - Send a message
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const senderId = req.user!.userId;
    const { recipientId, content } = req.body;

    if (!recipientId || !content) {
      return res.status(400).json({ message: 'Recipient ID and content are required.' });
    }

    // Check if user is trying to send a message to themselves
    if (senderId === recipientId) {
      return res.status(400).json({ message: 'Cannot send a message to yourself.' });
    }

    // 1. Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, role: true }
    });

    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found.' });
    }

    // 2. Create message
    const newMessage = await prisma.message.create({
      data: {
        sender: { connect: { id: senderId } },
        recipient: { connect: { id: recipientId } },
        content
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true
          }
        },
        recipient: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // 3. Send notification to recipient
    await notificationService.createAndSendNotification({
      userIdToNotify: recipientId,
      type: 'NEW_MESSAGE',
      relatedId: newMessage.id,
      context: {
        senderName: newMessage.sender.name
      }
    });

    return res.status(201).json(newMessage);
  } catch (error) {
    next(error);
  }
};

// GET /api/messages/inbox - List messages for the current user
export const listMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { unreadOnly } = req.query;

    // Get messages
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId },
          { recipientId: userId }
        ],
        ...(unreadOnly === 'true' ? { read: false } : {})
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Count unread messages
    const unreadCount = await prisma.message.count({
      where: {
        recipientId: userId,
        read: false
      }
    });

    // Transform messages to include direction
    const transformedMessages = messages.map(msg => ({
      ...msg,
      direction: msg.senderId === userId ? 'sent' : 'received'
    }));

    return res.status(200).json({
      messages: transformedMessages,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/messages/:id/read - Mark a message as read
export const markMessageAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { id: messageId } = req.params;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        recipient: {
          select: {
            id: true
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    // Only recipient can mark message as read
    if (message.recipient.id !== userId) {
      return res.status(403).json({ message: 'Forbidden: You can only mark messages sent to you as read.' });
    }

    // If message is already read, return early
    if (message.read) {
      return res.status(200).json({ message: 'Message was already read.' });
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { read: true },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            role: true
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            role: true
          }
        }
      }
    });

    return res.status(200).json(updatedMessage);
  } catch (error) {
    next(error);
  }
};
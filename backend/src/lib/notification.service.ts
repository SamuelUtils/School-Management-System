import prisma from './prisma';

// Define notification types as string literals
export type NotificationType =
  | 'FEE_ASSIGNED'
  | 'PAYMENT_RECEIVED'
  | 'FEE_OVERDUE_REMINDER'
  | 'ATTENDANCE_ABSENT'
  | 'NEW_MESSAGE'
  | 'QUERY_ASSIGNED'
  | 'QUERY_UPDATED'
  | 'QUERY_RESOLVED';

export interface FeeNotificationContext {
  studentName: string;
  feeCategoryName?: string;
  amount?: number;
  receiptNumber?: string;
  date?: string | Date;
}

export interface QueryNotificationContext {
  queryId?: string;
  querySubject: string;
  studentName: string;
  parentName?: string;
  assignedToName?: string;
  newStatus?: string;
  resolution?: string;
}

export interface MessageNotificationContext {
  studentName?: string;
  senderName?: string;
  message?: string;
}

export interface AttendanceNotificationContext {
  studentName: string;
  date: string | Date;
}

export interface GeneralNotificationPayload {
  userIdToNotify: string;
  type: NotificationType;
  relatedId?: string;
  messageBody?: string;
  context?: FeeNotificationContext | QueryNotificationContext | MessageNotificationContext | AttendanceNotificationContext;
}

class NotificationService {
  private formatContent(payload: GeneralNotificationPayload): string {
    if (payload.messageBody) {
      return payload.messageBody;
    }

    const ctx = payload.context || {};
    switch (payload.type) {
      case 'FEE_ASSIGNED':
      case 'PAYMENT_RECEIVED':
      case 'FEE_OVERDUE_REMINDER': {
        const feeCtx = ctx as FeeNotificationContext;
        if (payload.type === 'FEE_ASSIGNED') {
          return `Fee '${feeCtx.feeCategoryName || 'Fee'}' (Rs. ${feeCtx.amount?.toFixed(2) || 'N/A'}) assigned for ${feeCtx.studentName || 'your child'}.`;
        } else if (payload.type === 'PAYMENT_RECEIVED') {
          return `Payment of Rs. ${feeCtx.amount?.toFixed(2) || 'N/A'} (Receipt: ${feeCtx.receiptNumber || 'N/A'}) for ${feeCtx.feeCategoryName || 'fee'} received for ${feeCtx.studentName || 'your child'}.`;
        } else {
          return `Reminder: Fee payment Rs. ${feeCtx.amount?.toFixed(2) || 'N/A'} for '${feeCtx.feeCategoryName || 'Fee'}' (${feeCtx.studentName || 'your child'}) is overdue.`;
        }
      }
      case 'ATTENDANCE_ABSENT': {
        const attendanceCtx = ctx as AttendanceNotificationContext;
        return `Your child ${attendanceCtx.studentName || 'N/A'} was marked ABSENT on ${new Date(attendanceCtx.date || Date.now()).toISOString().split('T')[0]}.`;
      }
      case 'NEW_MESSAGE': {
        const messageCtx = ctx as MessageNotificationContext;
        return `You have a new message from ${messageCtx.senderName || 'a user'}.`;
      }
      case 'QUERY_ASSIGNED':
      case 'QUERY_UPDATED':
      case 'QUERY_RESOLVED': {
        const queryCtx = ctx as QueryNotificationContext;
        if (payload.type === 'QUERY_ASSIGNED') {
          return `Query "${queryCtx.querySubject || 'N/A'}" (Student: ${queryCtx.studentName || 'N/A'}) has been assigned to you.`;
        } else if (payload.type === 'QUERY_UPDATED') {
          return `Your query "${queryCtx.querySubject || 'N/A'}" (Student: ${queryCtx.studentName || 'N/A'}) has been updated. Status: ${queryCtx.newStatus || 'N/A'}.`;
        } else {
          return `Your query "${queryCtx.querySubject || 'N/A'}" (Student: ${queryCtx.studentName || 'N/A'}) has been resolved. Resolution: ${queryCtx.resolution || 'See details'}.`;
        }
      }
      default:
        // console.warn(`[Notification Service] Unknown notification type for formatting: ${payload.type}`);
        return 'You have a new notification from the school.';
    }
  }

  async createAndSendNotification(payload: GeneralNotificationPayload): Promise<void> {
    const userToNotify = await prisma.user.findUnique({ where: { id: payload.userIdToNotify } });
    if (!userToNotify) {
      // console.warn(`[Notification Service] User to notify not found: ${payload.userIdToNotify}. Notification for ${payload.type} not created.`);
      return;
    }

    const content = this.formatContent(payload);

    try {
      await prisma.notification.create({
        data: {
          userId: payload.userIdToNotify,
          type: payload.type,
          content: content,
          relatedId: payload.relatedId,
          read: false,
        },
      });
      // console.log(`[Notification Service] DB Notification created for User ${payload.userIdToNotify}, Type: ${payload.type}, Content: "${content.substring(0, 50)}..."`);

    } catch (dbError) {
      // console.error(`[Notification Service] Failed to create DB notification for User ${payload.userIdToNotify}:`, dbError);
    }
    return Promise.resolve();
  }

  // Legacy method for backward compatibility
  async sendNotification(payload: { to: string; message: string }): Promise<void> {
    // console.warn(`[Notification Service - Legacy Send] Deprecated. Use createAndSendNotification. To: ${payload.to}, Msg: "${payload.message}"`);
    return Promise.resolve();
  }
}

export const notificationService = new NotificationService();
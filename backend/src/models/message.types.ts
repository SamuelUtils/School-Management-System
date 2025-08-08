// src/models/message.types.ts

export interface MessageCreatePayload {
  recipientId: string;
  content: string;
}

export interface MessageResponse {
  id: string;
  content: string;
  read: boolean;
  createdAt: Date;
  sender: {
    id: string;
    name: string;
  };
  recipient: {
    id: string;
    name: string;
  };
}

// For inbox response, we might want to include sender/recipient names
export interface MessageView {
  id: string;
  content: string;
  read: boolean;
  createdAt: Date;
  senderId: string;
  senderName?: string; // Optional: to be populated
  recipientId: string;
  recipientName?: string; // Optional: to be populated
  direction: 'sent' | 'received'; // To help UI distinguish
}

export interface InboxView {
  messages: MessageView[];
  unreadCount: number;
}
import type { ChatMessage, LeadInfo } from "@/lib/chatbot/types";

export type WhatsAppConversationStatus = "AI_ACTIVE" | "HUMAN_HANDOFF";

export type WhatsAppQualificationState =
  | "new"
  | "qualifying"
  | "qualified"
  | "booking_requested"
  | "human_handoff";

export type WhatsAppMessageDirection = "inbound" | "outbound";

export type WhatsAppDeliveryStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

/** A validated text-like message extracted from a Meta webhook. */
export interface WhatsAppMessageEvent {
  kind: "message";
  messageId: string;
  from: string;
  messageType: string;
  text: string | null;
  timestamp: Date;
  profileName: string | null;
  metadataPhoneNumberId: string | null;
  businessAccountId: string | null;
  replyToMessageId: string | null;
}

/** A delivery/read status update from a Meta webhook. */
export interface WhatsAppStatusEvent {
  kind: "status";
  messageId: string;
  status: WhatsAppDeliveryStatus;
  timestamp: Date;
  recipientId: string | null;
  metadataPhoneNumberId: string | null;
  businessAccountId: string | null;
}

export type WhatsAppWebhookEvent = WhatsAppMessageEvent | WhatsAppStatusEvent;

export interface WhatsAppConversation {
  id: number;
  conversationId: string;
  phoneNumber: string;
  contactName: string | null;
  status: WhatsAppConversationStatus;
  qualificationState: WhatsAppQualificationState;
  leadInfo: LeadInfo;
  handoffNotificationStatus: "not_attempted" | "not_configured" | "notified" | "failed";
  handoffReason: string | null;
  crmSyncStatus: "not_attempted" | "not_configured" | "synced" | "failed";
  crmSyncFingerprint: string | null;
  recentMessages: ChatMessage[];
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppStore {
  readonly mode: "database" | "memory";
  getOrCreateConversation(phoneNumber: string, contactName?: string | null): Promise<WhatsAppConversation>;
  getConversation(conversationId: string): Promise<WhatsAppConversation | null>;
  getRecentMessages(conversationDbId: number, limit?: number): Promise<ChatMessage[]>;
  recordInboundMessage(
    conversationDbId: number,
    event: WhatsAppMessageEvent
  ): Promise<{ duplicate: boolean }>;
  markInboundMessage(
    providerMessageId: string,
    succeeded: boolean
  ): Promise<void>;
  recordOutboundMessage(input: {
    conversationDbId: number;
    providerMessageId: string;
    body: string;
    messageType?: string;
    deliveryStatus?: WhatsAppDeliveryStatus;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  updateMessageStatus(
    providerMessageId: string,
    status: WhatsAppDeliveryStatus,
    timestamp?: Date
  ): Promise<void>;
  updateConversation(
    conversationId: string,
    patch: Partial<
      Pick<
        WhatsAppConversation,
        | "status"
        | "qualificationState"
        | "leadInfo"
        | "handoffReason"
        | "handoffNotificationStatus"
        | "crmSyncStatus"
        | "crmSyncFingerprint"
      >
    >
  ): Promise<WhatsAppConversation | null>;
}

export interface WhatsAppProcessResult {
  handled: boolean;
  duplicate?: boolean;
  kind: "message" | "status";
  conversationId?: string;
  responseSent?: boolean;
  aiProvider?: "openai" | "internal" | "none";
  degraded?: boolean;
  status?: WhatsAppConversationStatus;
  error?: string;
}

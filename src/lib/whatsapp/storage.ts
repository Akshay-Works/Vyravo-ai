// WhatsApp conversation persistence.
//
// Production uses PostgreSQL, the same database connection as the rest of the
// Vyravo AI application. Message IDs are unique so duplicate Meta webhook
// deliveries can be acknowledged without generating a second reply. An
// explicit WHATSAPP_STORE=memory mode is available for local tests only.

import { randomUUID } from "node:crypto";
import { pool } from "@/db";
import type { ChatMessage, LeadInfo } from "@/lib/chatbot/types";
import type {
  WhatsAppConversation,
  WhatsAppDeliveryStatus,
  WhatsAppMessageEvent,
  WhatsAppStore,
} from "./types";

const MAX_CONTEXT_MESSAGES = 24;

const CREATE_WHATSAPP_TABLES = `
  CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id serial PRIMARY KEY,
    conversation_id varchar(128) NOT NULL UNIQUE,
    phone_number varchar(32) NOT NULL UNIQUE,
    contact_name text,
    status varchar(20) NOT NULL DEFAULT 'AI_ACTIVE',
    qualification_state varchar(40) NOT NULL DEFAULT 'new',
    lead_info jsonb NOT NULL DEFAULT '{}'::jsonb,
    handoff_reason text,
    handoff_notification_status varchar(20) NOT NULL DEFAULT 'not_attempted',
    crm_sync_status varchar(30) NOT NULL DEFAULT 'not_attempted',
    crm_sync_fingerprint varchar(128),
    last_message_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id serial PRIMARY KEY,
    conversation_id integer NOT NULL,
    provider_message_id varchar(160) NOT NULL UNIQUE,
    direction varchar(10) NOT NULL,
    message_type varchar(40) NOT NULL,
    body text,
    delivery_status varchar(30) NOT NULL DEFAULT 'received',
    processing_status varchar(20) NOT NULL DEFAULT 'completed',
    processing_started_at timestamp,
    provider_timestamp timestamp,
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx
    ON whatsapp_messages (conversation_id, provider_timestamp DESC, id DESC);
  CREATE INDEX IF NOT EXISTS whatsapp_messages_status_idx
    ON whatsapp_messages (provider_message_id, delivery_status);
`;

interface DatabaseConversationRow {
  id: number;
  conversation_id: string;
  phone_number: string;
  contact_name: string | null;
  status: string;
  qualification_state: string;
  lead_info: unknown;
  handoff_reason: string | null;
  handoff_notification_status: string;
  crm_sync_status: string;
  crm_sync_fingerprint: string | null;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DatabaseMessageRow {
  provider_message_id: string;
  direction: string;
  message_type: string;
  body: string | null;
  delivery_status: string;
  processing_status: string;
  processing_started_at: Date | null;
  provider_timestamp: Date | null;
  metadata: unknown;
  created_at: Date;
}

function asLeadInfo(value: unknown): LeadInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as LeadInfo;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageRowToChatMessage(row: DatabaseMessageRow): ChatMessage {
  const providerTimestamp = asDate(row.provider_timestamp) || asDate(row.created_at) || new Date();
  return {
    id: row.provider_message_id,
    role: row.direction === "outbound" ? "assistant" : "user",
    content: row.body || `[${row.message_type} message]`,
    timestamp: providerTimestamp,
    metadata: {
      sentiment: row.delivery_status,
      intent: row.message_type,
    },
  };
}

function rowToConversation(
  row: DatabaseConversationRow,
  recentMessages: ChatMessage[]
): WhatsAppConversation {
  const status = row.status === "HUMAN_HANDOFF" ? "HUMAN_HANDOFF" : "AI_ACTIVE";
  const qualificationStates = new Set([
    "new",
    "qualifying",
    "qualified",
    "booking_requested",
    "human_handoff",
  ]);
  const qualificationState = qualificationStates.has(row.qualification_state)
    ? (row.qualification_state as WhatsAppConversation["qualificationState"])
    : "new";
  const handoffStatuses = new Set(["not_attempted", "not_configured", "notified", "failed"]);
  const handoffNotificationStatus = handoffStatuses.has(row.handoff_notification_status)
    ? (row.handoff_notification_status as WhatsAppConversation["handoffNotificationStatus"])
    : "not_attempted";
  const crmStatuses = new Set(["not_attempted", "not_configured", "synced", "failed"]);
  const crmSyncStatus = crmStatuses.has(row.crm_sync_status)
    ? (row.crm_sync_status as WhatsAppConversation["crmSyncStatus"])
    : "not_attempted";

  return {
    id: Number(row.id),
    conversationId: row.conversation_id,
    phoneNumber: row.phone_number,
    contactName: row.contact_name,
    status,
    qualificationState,
    leadInfo: asLeadInfo(row.lead_info),
    handoffReason: row.handoff_reason,
    handoffNotificationStatus,
    crmSyncStatus,
    crmSyncFingerprint: row.crm_sync_fingerprint,
    recentMessages,
    lastMessageAt: asDate(row.last_message_at)?.toISOString() || null,
    createdAt: (asDate(row.created_at) || new Date()).toISOString(),
    updatedAt: (asDate(row.updated_at) || new Date()).toISOString(),
  };
}

async function ensureWhatsAppTables(): Promise<void> {
  await pool.query(CREATE_WHATSAPP_TABLES);
  // Additive safeguard for deployments that created an earlier version of the
  // WhatsApp tables before handoff notification state was introduced.
  await pool.query(
    `ALTER TABLE whatsapp_conversations
     ADD COLUMN IF NOT EXISTS handoff_notification_status varchar(20) NOT NULL DEFAULT 'not_attempted'`
  );
  await pool.query(
    `ALTER TABLE whatsapp_messages
     ADD COLUMN IF NOT EXISTS processing_status varchar(20) NOT NULL DEFAULT 'completed'`
  );
  await pool.query(
    `ALTER TABLE whatsapp_messages
     ADD COLUMN IF NOT EXISTS processing_started_at timestamp`
  );
}

class DatabaseWhatsAppStore implements WhatsAppStore {
  readonly mode = "database" as const;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  private async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = ensureWhatsAppTables().then(() => {
        this.ready = true;
      });
    }
    await this.initPromise;
    if (!this.ready) throw new Error("WhatsApp tables are unavailable");
  }

  async getOrCreateConversation(
    phoneNumber: string,
    contactName?: string | null
  ): Promise<WhatsAppConversation> {
    await this.init();
    const result = await pool.query<DatabaseConversationRow>(
      `INSERT INTO whatsapp_conversations
         (conversation_id, phone_number, contact_name, last_message_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (phone_number) DO UPDATE SET
         contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
         updated_at = now()
       RETURNING *`,
      [`wa_${randomUUID()}`, phoneNumber, contactName || null]
    );
    return rowToConversation(result.rows[0], await this.getRecentMessages(result.rows[0].id));
  }

  async getConversation(conversationId: string): Promise<WhatsAppConversation | null> {
    await this.init();
    const result = await pool.query<DatabaseConversationRow>(
      `SELECT * FROM whatsapp_conversations WHERE conversation_id = $1 LIMIT 1`,
      [conversationId]
    );
    if (!result.rows[0]) return null;
    return rowToConversation(
      result.rows[0],
      await this.getRecentMessages(result.rows[0].id)
    );
  }

  async getRecentMessages(conversationDbId: number, limit = MAX_CONTEXT_MESSAGES): Promise<ChatMessage[]> {
    await this.init();
    const boundedLimit = Math.max(1, Math.min(MAX_CONTEXT_MESSAGES, Math.floor(limit)));
    const result = await pool.query<DatabaseMessageRow>(
      `SELECT provider_message_id, direction, message_type, body,
              delivery_status, processing_status, processing_started_at,
              provider_timestamp, metadata, created_at
       FROM whatsapp_messages
       WHERE conversation_id = $1
       ORDER BY provider_timestamp DESC NULLS LAST, id DESC
       LIMIT $2`,
      [conversationDbId, boundedLimit]
    );
    return result.rows.reverse().map(messageRowToChatMessage);
  }

  async recordInboundMessage(
    conversationDbId: number,
    event: WhatsAppMessageEvent
  ): Promise<{ duplicate: boolean }> {
    await this.init();
    const result = await pool.query(
      `INSERT INTO whatsapp_messages
         (conversation_id, provider_message_id, direction, message_type, body,
          delivery_status, processing_status, processing_started_at,
          provider_timestamp, metadata)
       VALUES ($1, $2, 'inbound', $3, $4, 'received', 'processing', now(), $5, $6::jsonb)
       ON CONFLICT (provider_message_id) DO NOTHING
       RETURNING id`,
      [
        conversationDbId,
        event.messageId,
        event.messageType.slice(0, 40),
        event.text,
        event.timestamp,
        JSON.stringify({
          profileName: event.profileName,
          replyToMessageId: event.replyToMessageId,
          metadataPhoneNumberId: event.metadataPhoneNumberId,
          businessAccountId: event.businessAccountId,
        }),
      ]
    );

    if ((result.rowCount || 0) === 0) {
      // A retry after a transient failure may safely reclaim a pending/failed
      // message. A message already being processed or completed is ignored.
      const reclaimed = await pool.query(
        `UPDATE whatsapp_messages
         SET processing_status = 'processing', processing_started_at = now()
         WHERE provider_message_id = $1
           AND direction = 'inbound'
           AND (
             processing_status IN ('pending', 'failed')
             OR (processing_status = 'processing' AND processing_started_at < now() - interval '5 minutes')
           )
         RETURNING id`,
        [event.messageId]
      );
      if ((reclaimed.rowCount || 0) === 0) return { duplicate: true };
    }
    await pool.query(
      `UPDATE whatsapp_conversations
       SET last_message_at = $2, updated_at = now()
       WHERE id = $1`,
      [conversationDbId, event.timestamp]
    );
    return { duplicate: false };
  }

  async markInboundMessage(providerMessageId: string, succeeded: boolean): Promise<void> {
    await this.init();
    await pool.query(
      `UPDATE whatsapp_messages
       SET processing_status = $2,
           processing_started_at = NULL
       WHERE provider_message_id = $1 AND direction = 'inbound'`,
      [providerMessageId, succeeded ? "completed" : "failed"]
    );
  }

  async recordOutboundMessage(input: {
    conversationDbId: number;
    providerMessageId: string;
    body: string;
    messageType?: string;
    deliveryStatus?: WhatsAppDeliveryStatus;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.init();
    await pool.query(
      `INSERT INTO whatsapp_messages
         (conversation_id, provider_message_id, direction, message_type, body,
          delivery_status, provider_timestamp, metadata)
       VALUES ($1, $2, 'outbound', $3, $4, $5, now(), $6::jsonb)
       ON CONFLICT (provider_message_id) DO UPDATE SET
         body = EXCLUDED.body,
         delivery_status = EXCLUDED.delivery_status,
         metadata = EXCLUDED.metadata`,
      [
        input.conversationDbId,
        input.providerMessageId.slice(0, 160),
        (input.messageType || "text").slice(0, 40),
        input.body,
        input.deliveryStatus || "sent",
        JSON.stringify(input.metadata || {}),
      ]
    );
    await pool.query(
      `UPDATE whatsapp_conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
      [input.conversationDbId]
    );
  }

  async updateMessageStatus(
    providerMessageId: string,
    status: WhatsAppDeliveryStatus,
    timestamp?: Date
  ): Promise<void> {
    await this.init();
    await pool.query(
      `UPDATE whatsapp_messages
       SET delivery_status = $2,
           provider_timestamp = COALESCE($3, provider_timestamp)
       WHERE provider_message_id = $1`,
      [providerMessageId, status, timestamp || null]
    );
  }

  async updateConversation(
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
  ): Promise<WhatsAppConversation | null> {
    await this.init();
    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      assignments.push(`${sql} = $${values.length}`);
    };

    if (patch.status !== undefined) add("status", patch.status);
    if (patch.qualificationState !== undefined) add("qualification_state", patch.qualificationState);
    if (patch.leadInfo !== undefined) {
      values.push(JSON.stringify(patch.leadInfo));
      assignments.push(`lead_info = $${values.length}::jsonb`);
    }
    if (patch.handoffReason !== undefined) add("handoff_reason", patch.handoffReason);
    if (patch.handoffNotificationStatus !== undefined) add("handoff_notification_status", patch.handoffNotificationStatus);
    if (patch.crmSyncStatus !== undefined) add("crm_sync_status", patch.crmSyncStatus);
    if (patch.crmSyncFingerprint !== undefined) add("crm_sync_fingerprint", patch.crmSyncFingerprint);

    if (assignments.length === 0) return this.getConversation(conversationId);
    assignments.push("updated_at = now()");

    const result = await pool.query<DatabaseConversationRow>(
      `UPDATE whatsapp_conversations
       SET ${assignments.join(", ")}
       WHERE conversation_id = $${values.length + 1}
       RETURNING *`,
      [...values, conversationId]
    );
    if (!result.rows[0]) return null;
    return rowToConversation(
      result.rows[0],
      await this.getRecentMessages(result.rows[0].id)
    );
  }
}

interface MemoryMessage {
  providerMessageId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  body: string | null;
  deliveryStatus: WhatsAppDeliveryStatus;
  processingStatus: "processing" | "completed" | "failed";
  processingStartedAt: Date | null;
  providerTimestamp: Date;
  metadata?: Record<string, unknown>;
}

class MemoryWhatsAppStore implements WhatsAppStore {
  readonly mode = "memory" as const;
  private nextId = 1;
  private readonly conversations = new Map<number, WhatsAppConversation>();
  private readonly byPhone = new Map<string, number>();
  private readonly byConversationId = new Map<string, number>();
  private readonly messages = new Map<number, MemoryMessage[]>();
  private readonly providerMessageIds = new Set<string>();

  async getOrCreateConversation(phoneNumber: string, contactName?: string | null): Promise<WhatsAppConversation> {
    const existingId = this.byPhone.get(phoneNumber);
    if (existingId) {
      const existing = this.conversations.get(existingId)!;
      if (contactName && !existing.contactName) existing.contactName = contactName;
      existing.updatedAt = new Date().toISOString();
      return this.snapshot(existing);
    }

    const now = new Date().toISOString();
    const conversation: WhatsAppConversation = {
      id: this.nextId++,
      conversationId: `wa_${randomUUID()}`,
      phoneNumber,
      contactName: contactName || null,
      status: "AI_ACTIVE",
      qualificationState: "new",
      leadInfo: {},
      handoffNotificationStatus: "not_attempted",
      handoffReason: null,
      crmSyncStatus: "not_attempted",
      crmSyncFingerprint: null,
      recentMessages: [],
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    this.byPhone.set(phoneNumber, conversation.id);
    this.byConversationId.set(conversation.conversationId, conversation.id);
    this.messages.set(conversation.id, []);
    return this.snapshot(conversation);
  }

  async getConversation(conversationId: string): Promise<WhatsAppConversation | null> {
    const id = this.byConversationId.get(conversationId);
    const conversation = id ? this.conversations.get(id) : null;
    return conversation ? this.snapshot(conversation) : null;
  }

  async getRecentMessages(conversationDbId: number, limit = MAX_CONTEXT_MESSAGES): Promise<ChatMessage[]> {
    const rows = (this.messages.get(conversationDbId) || []).slice(-Math.max(1, Math.min(MAX_CONTEXT_MESSAGES, limit)));
    return rows.map((row) => ({
      id: row.providerMessageId,
      role: row.direction === "outbound" ? "assistant" : "user",
      content: row.body || `[${row.messageType} message]`,
      timestamp: row.providerTimestamp,
      metadata: { sentiment: row.deliveryStatus, intent: row.messageType },
    }));
  }

  async recordInboundMessage(conversationDbId: number, event: WhatsAppMessageEvent): Promise<{ duplicate: boolean }> {
    if (this.providerMessageIds.has(event.messageId)) {
      for (const rows of this.messages.values()) {
        const existing = rows.find((message) => message.providerMessageId === event.messageId && message.direction === "inbound");
        if (!existing) return { duplicate: true };
        const stale = existing.processingStartedAt && Date.now() - existing.processingStartedAt.getTime() > 5 * 60_000;
        if (existing.processingStatus === "failed" || (existing.processingStatus === "processing" && stale)) {
          existing.processingStatus = "processing";
          existing.processingStartedAt = new Date();
          return { duplicate: false };
        }
        return { duplicate: true };
      }
      return { duplicate: true };
    }
    this.providerMessageIds.add(event.messageId);
    this.messages.get(conversationDbId)?.push({
      providerMessageId: event.messageId,
      direction: "inbound",
      messageType: event.messageType,
      body: event.text,
      deliveryStatus: "received",
      processingStatus: "processing",
      processingStartedAt: new Date(),
      providerTimestamp: event.timestamp,
      metadata: {
        profileName: event.profileName,
        businessAccountId: event.businessAccountId,
      },
    });
    const conversation = this.conversations.get(conversationDbId);
    if (conversation) {
      conversation.lastMessageAt = event.timestamp.toISOString();
      conversation.updatedAt = new Date().toISOString();
    }
    return { duplicate: false };
  }

  async markInboundMessage(providerMessageId: string, succeeded: boolean): Promise<void> {
    for (const rows of this.messages.values()) {
      const row = rows.find((message) => message.providerMessageId === providerMessageId && message.direction === "inbound");
      if (row) {
        row.processingStatus = succeeded ? "completed" : "failed";
        row.processingStartedAt = null;
        return;
      }
    }
  }

  async recordOutboundMessage(input: {
    conversationDbId: number;
    providerMessageId: string;
    body: string;
    messageType?: string;
    deliveryStatus?: WhatsAppDeliveryStatus;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.providerMessageIds.has(input.providerMessageId)) {
      this.providerMessageIds.add(input.providerMessageId);
      this.messages.get(input.conversationDbId)?.push({
        providerMessageId: input.providerMessageId,
        direction: "outbound",
        messageType: input.messageType || "text",
        body: input.body,
        deliveryStatus: input.deliveryStatus || "sent",
        processingStatus: "completed",
        processingStartedAt: null,
        providerTimestamp: new Date(),
        metadata: input.metadata,
      });
    }
    const conversation = this.conversations.get(input.conversationDbId);
    if (conversation) {
      conversation.lastMessageAt = new Date().toISOString();
      conversation.updatedAt = new Date().toISOString();
    }
  }

  async updateMessageStatus(providerMessageId: string, status: WhatsAppDeliveryStatus, timestamp?: Date): Promise<void> {
    for (const rows of this.messages.values()) {
      const row = rows.find((message) => message.providerMessageId === providerMessageId);
      if (row) {
        row.deliveryStatus = status;
        if (timestamp) row.providerTimestamp = timestamp;
        return;
      }
    }
  }

  async updateConversation(
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
  ): Promise<WhatsAppConversation | null> {
    const id = this.byConversationId.get(conversationId);
    const conversation = id ? this.conversations.get(id) : null;
    if (!conversation) return null;
    Object.assign(conversation, patch, { updatedAt: new Date().toISOString() });
    return this.snapshot(conversation);
  }

  private snapshot(conversation: WhatsAppConversation): WhatsAppConversation {
    return {
      ...conversation,
      leadInfo: { ...conversation.leadInfo },
      recentMessages: [...(this.messages.get(conversation.id) || [])].slice(-MAX_CONTEXT_MESSAGES).map((row) => ({
        id: row.providerMessageId,
        role: row.direction === "outbound" ? "assistant" : "user",
        content: row.body || `[${row.messageType} message]`,
        timestamp: row.providerTimestamp,
        metadata: { sentiment: row.deliveryStatus, intent: row.messageType },
      })),
    };
  }
}

let store: WhatsAppStore | null = null;
let memoryFallbackUntil = 0;

export function createMemoryWhatsAppStore(): WhatsAppStore {
  return new MemoryWhatsAppStore();
}

export function getWhatsAppStore(): WhatsAppStore {
  if (process.env.WHATSAPP_STORE === "memory") {
    if (!store || store.mode !== "memory") store = new MemoryWhatsAppStore();
    return store;
  }
  // Preserve a transient in-memory fallback long enough to keep a user's
  // context during a short database outage, then probe PostgreSQL again.
  if (store?.mode === "memory" && memoryFallbackUntil > Date.now()) return store;
  if (!store || store.mode !== "database") store = new DatabaseWhatsAppStore();
  return store;
}

export function setWhatsAppStore(next: WhatsAppStore): void {
  store = next;
  memoryFallbackUntil = next.mode === "memory" && process.env.WHATSAPP_STORE !== "memory"
    ? Date.now() + 60_000
    : 0;
}

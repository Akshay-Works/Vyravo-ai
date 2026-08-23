import { normalizeWhatsAppPhone } from "./meta";
import type {
  WhatsAppMessageEvent,
  WhatsAppStatusEvent,
  WhatsAppWebhookEvent,
  WhatsAppDeliveryStatus,
} from "./types";

interface UnknownRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanMessageText(value: unknown, maxLength = 2000): string | null {
  const text = asString(value);
  if (!text) return null;
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseTimestamp(value: unknown): Date {
  const seconds = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    const date = new Date(seconds * 1000);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function extractInteractiveText(message: UnknownRecord): string | null {
  const interactive = asRecord(message.interactive);
  if (!interactive) return null;

  const buttonReply = asRecord(interactive.button_reply);
  const listReply = asRecord(interactive.list_reply);
  return asString(buttonReply?.title) || asString(listReply?.title);
}

/**
 * Extract the text that can safely be sent through the existing chatbot.
 * Text, reply buttons, and list replies are text-like; media and other
 * message types are deliberately returned as unsupported rather than guessed.
 */
function extractMessageText(message: UnknownRecord): string | null {
  const type = asString(message.type);
  if (type === "text") {
    return cleanMessageText(asRecord(message.text)?.body);
  }
  if (type === "button") {
    return cleanMessageText(asRecord(message.button)?.text);
  }
  if (type === "interactive") return cleanMessageText(extractInteractiveText(message));
  return null;
}

function parseStatus(value: unknown): WhatsAppDeliveryStatus | null {
  switch (value) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function getProfileName(contacts: unknown[], from: string): string | null {
  for (const item of contacts) {
    const contact = asRecord(item);
    if (!contact) continue;
    const waId = normalizeWhatsAppPhone(contact.wa_id);
    const profile = asRecord(contact.profile);
    const name = cleanMessageText(profile?.name, 160);
    if (waId === from && name) return name;
  }
  return null;
}

/**
 * Parse a Meta webhook without trusting arbitrary nested values. Unknown
 * fields are ignored so a new Meta event shape cannot crash the route.
 */
export function parseWhatsAppWebhookPayload(payload: unknown): WhatsAppWebhookEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== "whatsapp_business_account") return [];

  const events: WhatsAppWebhookEvent[] = [];
  for (const entryValue of asArray(root.entry)) {
    const entry = asRecord(entryValue);
    if (!entry) continue;
    const businessAccountId = asString(entry.id);

    for (const changeValue of asArray(entry.changes)) {
      const change = asRecord(changeValue);
      const value = asRecord(change?.value);
      if (!value) continue;

      const metadata = asRecord(value.metadata);
      const metadataPhoneNumberId = asString(metadata?.phone_number_id);
      const contacts = asArray(value.contacts);

      for (const messageValue of asArray(value.messages)) {
        const message = asRecord(messageValue);
        if (!message) continue;

        const messageId = asString(message.id);
        const from = normalizeWhatsAppPhone(message.from);
        const messageType = asString(message.type) || "unknown";
        if (!messageId || messageId.length > 160 || !from) continue;

        const context = asRecord(message.context);
        const event: WhatsAppMessageEvent = {
          kind: "message",
          messageId,
          from,
          messageType,
          text: extractMessageText(message),
          timestamp: parseTimestamp(message.timestamp),
          profileName: getProfileName(contacts, from),
          metadataPhoneNumberId,
          businessAccountId,
          replyToMessageId: asString(context?.id),
        };
        events.push(event);
      }

      for (const statusValue of asArray(value.statuses)) {
        const statusRecord = asRecord(statusValue);
        if (!statusRecord) continue;
        const messageId = asString(statusRecord.id);
        const status = parseStatus(statusRecord.status);
        if (!messageId || messageId.length > 160 || !status) continue;

        const event: WhatsAppStatusEvent = {
          kind: "status",
          messageId,
          status,
          timestamp: parseTimestamp(statusRecord.timestamp),
          recipientId: normalizeWhatsAppPhone(statusRecord.recipient_id),
          metadataPhoneNumberId,
          businessAccountId,
        };
        events.push(event);
      }
    }
  }

  return events;
}

export function isWhatsAppWebhookEnvelope(payload: unknown): boolean {
  const root = asRecord(payload);
  return Boolean(root && root.object === "whatsapp_business_account" && Array.isArray(root.entry));
}

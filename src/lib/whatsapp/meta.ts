// Official Meta WhatsApp Cloud API client.
// Server-only: this module must never be imported by a client component.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_GRAPH_API_VERSION = "v23.0";
const GRAPH_API_BASE = "https://graph.facebook.com";
const MAX_TEXT_LENGTH = 4096;
const REQUEST_TIMEOUT_MS = 15_000;

export interface WhatsAppApiMessageResult {
  messageId: string | null;
  contacts: { waId?: string }[];
}

export interface WhatsAppConfigStatus {
  configured: boolean;
  signatureVerificationConfigured: boolean;
  webhookVerificationConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  businessAccountIdConfigured: boolean;
}

export function getWhatsAppConfigStatus(): WhatsAppConfigStatus {
  return {
    configured: Boolean(
      process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() &&
        process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
    ),
    signatureVerificationConfigured: Boolean(process.env.META_WHATSAPP_APP_SECRET?.trim()),
    webhookVerificationConfigured: Boolean(process.env.META_WHATSAPP_VERIFY_TOKEN?.trim()),
    phoneNumberIdConfigured: Boolean(process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()),
    businessAccountIdConfigured: Boolean(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim()),
  };
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfigStatus().configured;
}

function getAccessToken(): string {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("META_WHATSAPP_ACCESS_TOKEN is not configured");
  return token;
}

function getPhoneNumberId(): string {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error("META_WHATSAPP_PHONE_NUMBER_ID is not configured");
  return phoneNumberId;
}

function getGraphApiVersion(): string {
  const configured = process.env.META_GRAPH_API_VERSION?.trim();
  return configured || DEFAULT_GRAPH_API_VERSION;
}

/** Normalize a WhatsApp wa_id or E.164 phone number to digits only. */
export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^[+\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  // WhatsApp phone IDs are international numbers. Reject obviously malformed
  // values before they can be used as API recipients or CRM identifiers.
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

export function formatWhatsAppPhone(value: string): string {
  const normalized = normalizeWhatsAppPhone(value);
  return normalized ? `+${normalized}` : value;
}

/** Mask a phone for logs; message content and credentials are never logged. */
export function maskWhatsAppPhone(value: string): string {
  const digits = normalizeWhatsAppPhone(value) || value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 * Returning false when the app secret is absent is intentional: production
 * webhooks must fail closed instead of accepting unsigned requests.
 */
export function verifyMetaVerificationToken(receivedToken: string | null): boolean {
  const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expectedToken || !receivedToken) return false;
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  const receivedBuffer = Buffer.from(receivedToken.trim(), "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim();
  if (!appSecret || !signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex")}`;
  const received = signatureHeader.trim();

  try {
    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(received, "utf8");
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  } catch {
    return false;
  }
}

/** Send a text message through the official WhatsApp Cloud API. */
export async function sendWhatsAppTextMessage(
  recipient: string,
  body: string,
  replyToMessageId?: string | null
): Promise<WhatsAppApiMessageResult> {
  const to = normalizeWhatsAppPhone(recipient);
  if (!to) throw new Error("Invalid WhatsApp recipient");

  const text = body.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) throw new Error("WhatsApp message body is empty");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GRAPH_API_BASE}/${getGraphApiVersion()}/${getPhoneNumberId()}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text },
          ...(replyToMessageId
            ? { context: { message_id: replyToMessageId } }
            : {}),
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // Do not include the response body: Meta errors can contain request
      // details and should never be forwarded to a customer or log verbatim.
      throw new Error(`Meta WhatsApp API request failed with status ${response.status}`);
    }

    const data = (await response.json().catch(() => ({}))) as {
      messages?: { id?: unknown }[];
      contacts?: { wa_id?: unknown }[];
    };

    return {
      messageId: typeof data.messages?.[0]?.id === "string" ? data.messages[0].id : null,
      contacts: Array.isArray(data.contacts)
        ? data.contacts.map((contact) => ({
            waId: typeof contact.wa_id === "string" ? contact.wa_id : undefined,
          }))
        : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const WHATSAPP_MAX_TEXT_LENGTH = MAX_TEXT_LENGTH;

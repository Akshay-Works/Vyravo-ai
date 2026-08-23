import { after } from "next/server";
import {
  getWhatsAppConfigStatus,
  verifyMetaSignature,
  verifyMetaVerificationToken,
} from "@/lib/whatsapp/meta";
import {
  isWhatsAppWebhookEnvelope,
  parseWhatsAppWebhookPayload,
} from "@/lib/whatsapp/webhook";
import { processWhatsAppMessage, processWhatsAppStatus } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Covers the bounded OpenAI/HubSpot work scheduled with `after`. Adjust the
// Vercel plan/function limit if a longer processing budget is needed.
export const maxDuration = 60;

const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

function errorResponse(message: string, status: number): Response {
  return Response.json({ received: false, error: message }, { status });
}

/** Meta webhook verification handshake. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const config = getWhatsAppConfigStatus();

  if (!config.webhookVerificationConfigured) {
    console.error("WhatsApp webhook verification is not configured");
    return errorResponse("Webhook verification is not configured", 503);
  }

  if (mode === "subscribe" && challenge && verifyMetaVerificationToken(token)) {
    console.info("WhatsApp webhook verified");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn("Invalid WhatsApp webhook verification attempt");
  return errorResponse("Invalid webhook verification", 403);
}

/**
 * Receive Meta webhook notifications. The request is authenticated before it
 * is parsed. Processing is scheduled after the 200 response so Meta does not
 * retry a valid event while OpenAI, HubSpot, or the Cloud API is working.
 */
export async function POST(request: Request): Promise<Response> {
  const config = getWhatsAppConfigStatus();
  if (!config.signatureVerificationConfigured) {
    console.error("WhatsApp webhook rejected: app-secret signature verification is not configured");
    return errorResponse("Webhook signature verification is not configured", 503);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse("Unable to read webhook body", 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BODY_BYTES) {
    return errorResponse("Webhook body is too large", 413);
  }

  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    console.warn("Invalid WhatsApp webhook signature");
    return errorResponse("Invalid webhook signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("Invalid JSON webhook body", 400);
  }

  if (!isWhatsAppWebhookEnvelope(payload)) {
    return errorResponse("Unsupported webhook payload", 400);
  }

  const events = parseWhatsAppWebhookPayload(payload);
  const expectedPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const expectedBusinessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const acceptedEvents = events.filter((event) => {
    const phoneMatches =
      !expectedPhoneNumberId || event.metadataPhoneNumberId === expectedPhoneNumberId;
    const businessMatches =
      !expectedBusinessAccountId || event.businessAccountId === expectedBusinessAccountId;
    return phoneMatches && businessMatches;
  });

  if (acceptedEvents.length !== events.length) {
    console.warn("Ignored WhatsApp events for an unexpected Meta account or phone number ID", {
      ignored: events.length - acceptedEvents.length,
    });
  }

  // `after` is supported by Next route handlers on Vercel and keeps the
  // webhook acknowledgement fast. A catch here protects the webhook from a
  // scheduling failure without exposing internal details.
  try {
    after(async () => {
      for (const event of acceptedEvents) {
        if (event.kind === "message") {
          await processWhatsAppMessage(event);
        } else {
          await processWhatsAppStatus(event);
        }
      }
    });
  } catch (error) {
    console.error("WhatsApp webhook processing could not be scheduled", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    // In a non-Next test/runtime, process the event without failing the
    // authenticated webhook request. The callback itself still catches all
    // message-level failures.
    void Promise.all(
      acceptedEvents.map((event) =>
        event.kind === "message" ? processWhatsAppMessage(event) : processWhatsAppStatus(event)
      )
    ).catch((processingError) => {
      console.error("WhatsApp webhook processing failed", {
        error: processingError instanceof Error ? processingError.message : "unknown error",
      });
    });
  }

  return Response.json({
    received: true,
    queued: acceptedEvents.length,
  });
}

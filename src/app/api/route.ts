import { db } from "@/db";
import { webhookLogs } from "@/db/schema";

// Webhook endpoint for external integrations (Calendly, etc.)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const webhookType = request.headers.get("x-webhook-type") || "unknown";
    
    // Log the webhook
    await db.insert(webhookLogs).values({
      webhookType,
      status: "received",
      payload: body,
    });

    // Handle different webhook types
    switch (webhookType) {
      case "calendly":
        return handleCalendlyWebhook(body);
      case "stripe":
        return handleStripeWebhook(body);
      default:
        return Response.json({ received: true });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleCalendlyWebhook(payload: Record<string, unknown>) {
  // Handle Calendly events (invitee.created, invitee.canceled, etc.)
  const event = payload.event as string;
  
  switch (event) {
    case "invitee.created":
      // Update lead with meeting details
      console.log("Calendly meeting booked:", payload);
      break;
    case "invitee.canceled":
      // Update lead status to cancelled
      console.log("Calendly meeting cancelled:", payload);
      break;
    default:
      console.log("Unknown Calendly event:", event);
  }
  
  return Response.json({ received: true });
}

async function handleStripeWebhook(payload: Record<string, unknown>) {
  // Handle Stripe events for payment tracking
  console.log("Stripe webhook received:", payload);
  return Response.json({ received: true });
}

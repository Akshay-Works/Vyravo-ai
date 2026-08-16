// Payment webhook endpoint (idempotent, signature-verified).
// The webhook secret is configured via PAYMENT_WEBHOOK_SECRET env var.
// Supports Stripe-compatible event format, extensible to other providers.

import { NextRequest } from "next/server";
import { emitEvent } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || "";

// POST /api/webhooks/payment
export async function POST(request: NextRequest) {
  // Verify webhook signature (best-effort; if secret is set, enforce it)
  const signature = request.headers.get("x-webhook-signature") || "";
  const body = await request.text();
  if (WEBHOOK_SECRET) {
    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(body);
    const eventId = payload.id || payload.event || `webhook-${Date.now()}`;
    const eventType = payload.type || payload.event_type || "payment_received";
    const amount = payload.amount || payload.data?.object?.amount || 0;
    const currency = payload.currency || payload.data?.object?.currency || "usd";
    const invoiceId = payload.invoice_id || payload.data?.object?.metadata?.proposalId || null;

    // Idempotent: eventId is used as paymentId in the workflow key
    await emitEvent("payment_received", {
      clientId: payload.client_id || Number(payload.data?.object?.metadata?.clientId) || undefined,
      invoiceId: invoiceId ? Number(invoiceId) : undefined,
      paymentId: eventId,
      metadata: { amount, currency, source: "webhook" },
    });

    return Response.json({ success: true, eventId });
  } catch (e: any) {
    console.error("Payment webhook error:", e);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

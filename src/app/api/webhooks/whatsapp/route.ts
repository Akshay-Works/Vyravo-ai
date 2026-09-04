import { NextRequest } from "next/server";
import { verifyWhatsAppSignature, verifyToken, processWhatsAppWebhook } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";

// GET /api/webhooks/whatsapp — Meta's webhook verification handshake.
// `hub.challenge` is echoed back only when hub.verify_token matches
// WHATSAPP_VERIFY_TOKEN (server env). Fails closed otherwise.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && verifyToken(token) && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// POST /api/webhooks/whatsapp — message statuses (sent/delivered/read/failed)
// and incoming replies / opt-outs. Signature verified against the raw body
// with the Meta App Secret. Fail closed: no secret → 503, bad signature → 401.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"))) {
    const hasSecret = Boolean(process.env.WHATSAPP_APP_SECRET);
    return Response.json({ error: hasSecret ? "invalid signature" : "WHATSAPP_APP_SECRET not set" }, { status: hasSecret ? 401 : 503 });
  }
  try {
    const payload = JSON.parse(raw || "{}");
    const result = await processWhatsAppWebhook(payload);
    // Meta expects a fast 200 — even when we matched nothing
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("WhatsApp webhook error:", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

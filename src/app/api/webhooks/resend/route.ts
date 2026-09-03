import { NextRequest } from "next/server";
import { verifySvixSignature, handleResendEvent } from "@/lib/outreach/webhook";

export const dynamic = "force-dynamic";

// POST /api/webhooks/resend — Resend delivery webhook (configure in the
// Resend dashboard: Events → add webhook URL + signing secret).
// Auth: Svix v1 signature headers (RESEND_WEBHOOK_SECRET env). Fails closed:
// if the secret isn't configured, the endpoint refuses everything.
export async function POST(request: NextRequest) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return Response.json({ error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 503 });
  }
  const raw = await request.text().catch(() => "");
  const ok = verifySvixSignature(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signatures: request.headers.get("svix-signature"),
    },
    raw
  );
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Bad payload" }, { status: 400 }); }
  try {
    const handled = await handleResendEvent(payload);
    return Response.json({ ok: true, handled });
  } catch (e: any) {
    console.error("Resend webhook error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

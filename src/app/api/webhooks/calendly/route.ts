import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/webhooks/calendly — Calendly invitee.created → instant booking run.
// Setup: Calendly dashboard → Integrations → Webhooks → subscribe invitee.created
// to https://<prod>/api/webhooks/calendly, set CALENDLY_WEBHOOK_SECRET in Vercel.
export async function POST(request: NextRequest) {
  const secret = (process.env.CALENDLY_WEBHOOK_SECRET || "").trim();
  if (!secret) return Response.json({ error: "webhook not configured" }, { status: 503 });
  const raw = await request.text().catch(() => "");
  const sig = request.headers.get("calendly-webhook-signature") || "";
  try {
    const mac = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const blen = Buffer.from(mac);
    if (a.length !== blen.length || !timingSafeEqual(a, blen))
      return Response.json({ error: "bad signature" }, { status: 401 });
  } catch {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }
  let event = "";
  try { event = JSON.parse(raw)?.event || ""; } catch { /* ignore */ }
  if (event !== "invitee.created") return Response.json({ ok: true, ignored: event || "unparseable" });
  try {
    const { meetingTick } = await import("@/lib/sales/meetings");
    const r = await meetingTick({ max: 10, budgetMs: 20000 });
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

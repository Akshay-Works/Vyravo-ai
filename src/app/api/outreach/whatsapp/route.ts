import { NextRequest } from "next/server";
import { runWhatsAppPipeline } from "@/lib/whatsapp/pipeline";

export const dynamic = "force-dynamic";

// POST /api/outreach/whatsapp?generate=1 — called by the lead-engine workflow
// right after it pushes new leads (same ADMIN_API_URL + ENGINE_INGEST_KEY
// secrets already used by the email + LinkedIn hooks). Idempotent; never
// sends unless Sending is ON, TEST is OFF and the Meta API is configured.
export async function POST(request: NextRequest) {
  const key = (process.env.ENGINE_INGEST_KEY || "").trim();
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!key || (request.headers.get("x-engine-key") !== key && token !== key)) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const generate = url.searchParams.get("generate") === "1";
    const send = url.searchParams.get("send") === "1";
    const result = await runWhatsAppPipeline({ generate, send });
    return Response.json({ success: true, ...result });
  } catch (e: any) {
    console.error("WhatsApp pipeline error:", e);
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

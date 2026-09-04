import { NextRequest } from "next/server";
import { runLinkedInPipeline } from "@/lib/linkedin/pipeline";

export const dynamic = "force-dynamic";

// POST /api/outreach/linkedin?generate=1 — called by the lead-engine workflow
// right after it pushes new leads to the CRM (same ADMIN_API_URL +
// ENGINE_INGEST_KEY secrets already used by the email outreach hook).
// Idempotent: a lead can only ever produce ONE activity per follow-up number.
// Sending is never implied: with no sender configured / sending OFF, messages
// simply stay in the approval queue.
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
    const result = await runLinkedInPipeline({ generate, send });
    return Response.json({ success: true, ...result });
  } catch (e: any) {
    console.error("LinkedIn pipeline error:", e);
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

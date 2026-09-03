import { NextRequest } from "next/server";
import { runOutreachPipeline } from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";

// POST /api/outreach/pipeline?send=1 — called by the lead-engine workflow
// right after it pushes new leads to the CRM (same ADMIN_API_URL +
// ENGINE_INGEST_KEY secrets already used by the push step). Idempotent:
// a lead can only ever produce ONE event per follow-up number.
export async function POST(request: NextRequest) {
  const key = (process.env.ENGINE_INGEST_KEY || "").trim();
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!key || (request.headers.get("x-engine-key") !== key && token !== key)) {
    return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const send = new URL(request.url).searchParams.get("send") === "1";
    const result = await runOutreachPipeline({ send });
    return Response.json({ success: true, ...result });
  } catch (e: any) {
    console.error("Outreach pipeline error:", e);
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

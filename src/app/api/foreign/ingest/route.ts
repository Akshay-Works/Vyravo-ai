import { NextRequest } from "next/server";
import { engineAuthed } from "@/lib/foreign/auth";
import { ingestForeignBatch } from "@/lib/foreign/ingest";

export const dynamic = "force-dynamic";

// POST /api/foreign/ingest — engine → admin (Bearer ENGINE_INGEST_KEY).
// Body: { leads: [...] } (≤100 per call). Validates + dedupes + merges.
export async function POST(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.leads) || body.leads.length === 0) {
    return Response.json({ success: false, error: "leads array required" }, { status: 400 });
  }
  if (body.leads.length > 100) return Response.json({ success: false, error: "max 100 per call" }, { status: 400 });
  try {
    const r = await ingestForeignBatch(body.leads);
    return Response.json({ success: true, ...r });
  } catch (e: any) {
    console.error("foreign ingest error:", e);
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

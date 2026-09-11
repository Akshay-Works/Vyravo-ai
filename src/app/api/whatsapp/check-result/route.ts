import { NextRequest } from "next/server";
import { pool } from "@/db";
import { engineAuthed } from "@/lib/foreign/auth";
import { ensureWhatsappCheckSchema } from "@/lib/whatsapp/check";

export const dynamic = "force-dynamic";

// POST /api/whatsapp/check-result — engine → admin (Bearer ENGINE_INGEST_KEY).
// Body: { results: [{ lead_id, exists, number? }] } (≤200 per call).
export async function POST(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.results) || body.results.length === 0) {
    return Response.json({ success: false, error: "results array required" }, { status: 400 });
  }
  if (body.results.length > 200) return Response.json({ success: false, error: "max 200 per call" }, { status: 400 });
  await ensureWhatsappCheckSchema();
  let updated = 0;
  for (const r of body.results.slice(0, 200)) {
    const id = Number(r?.lead_id);
    if (!Number.isInteger(id) || typeof r?.exists !== "boolean") continue;
    const num = typeof r?.number === "string" ? r.number.replace(/\D/g, "").slice(0, 15) || null : null;
    const u = await pool.query(
      `UPDATE leads SET whatsapp_exists = $2, whatsapp_checked_number = $3, whatsapp_checked_at = now() WHERE id = $1`,
      [id, r.exists, num]
    );
    if (u.rowCount) updated++;
  }
  return Response.json({ success: true, updated });
}

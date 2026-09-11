import { NextRequest } from "next/server";
import { pool } from "@/db";
import { engineAuthed } from "@/lib/foreign/auth";
import { ensureWhatsappCheckSchema } from "@/lib/whatsapp/check";

export const dynamic = "force-dynamic";

// GET /api/whatsapp/check-queue?limit=100 — engine → admin (Bearer ENGINE_INGEST_KEY).
// Next unchecked engine+funnel2 leads with phones (oldest first).
export async function GET(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureWhatsappCheckSchema();
  const q = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit") || 100), 1), 200);
  const r = await pool.query(
    `SELECT id AS lead_id, phone, country FROM leads
     WHERE source IN ('lead_engine','funnel2')
       AND phone IS NOT NULL AND phone <> ''
       AND whatsapp_exists IS NULL
     ORDER BY id ASC LIMIT $1`,
    [limit]
  );
  return Response.json({ success: true, count: r.rows.length, leads: r.rows });
}

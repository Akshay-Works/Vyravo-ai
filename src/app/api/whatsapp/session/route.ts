import { NextRequest } from "next/server";
import { pool } from "@/db";
import { engineAuthed } from "@/lib/foreign/auth";
import { ensureWhatsappCheckSchema } from "@/lib/whatsapp/check";

export const dynamic = "force-dynamic";

// Baileys session bundle store (single row). The nightly job resumes the
// login from here; wa-login.mjs uploads it after the one-time QR scan.
// GET → { configured, data? } · PUT { data | null } → { success }.
export async function GET(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  await ensureWhatsappCheckSchema();
  const r = await pool.query(`SELECT data FROM whatsapp_session WHERE id = 1`);
  const data = r.rows[0]?.data || null;
  return Response.json({ success: true, configured: !!data, data });
}

export async function PUT(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!("data" in body)) return Response.json({ success: false, error: "data required (object or null)" }, { status: 400 });
  await ensureWhatsappCheckSchema();
  await pool.query(
    `INSERT INTO whatsapp_session (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [body.data === null ? null : JSON.stringify(body.data)]
  );
  return Response.json({ success: true, configured: body.data !== null });
}

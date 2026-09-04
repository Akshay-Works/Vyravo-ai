import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureWhatsAppSchema } from "@/lib/whatsapp/pipeline";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp/templates — template registry (server-side only;
// Meta accepts templates by provider name + language — we store the local
// mapping + purpose here).
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureWhatsAppSchema();
    const r = await pool.query(
      `SELECT id, name, provider_name, language, category, purpose, variable_count, is_active, created_at FROM whatsapp_templates ORDER BY id`
    );
    return Response.json({ ok: true, templates: r.rows });
  } catch (e: any) {
    console.error("WhatsApp templates error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// PUT /api/admin/whatsapp/templates — update one template (provider name,
// language, category, purpose, active). is_active = "this template exists and
// is approved in Meta" — sending only ever uses active templates.
export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureWhatsAppSchema();
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id || 0);
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    const fields: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any, validate?: (v: any) => boolean) => {
      if (val !== undefined && (!validate || validate(val))) { params.push(val); fields.push(`${col} = $${params.length}`); }
    };
    push("provider_name", typeof body.provider_name === "string" ? body.provider_name.trim() : undefined, (v) => /^[A-Za-z0-9_]{3,60}$/.test(v));
    push("language", typeof body.language === "string" ? body.language.trim().slice(0, 10) : undefined);
    push("category", typeof body.category === "string" ? body.category.trim().toUpperCase().slice(0, 20) : undefined, (v) => ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(v));
    push("purpose", typeof body.purpose === "string" ? body.purpose.trim() : undefined, (v) => ["intro", "follow_up_1", "follow_up_2"].includes(v));
    push("variable_count", body.variable_count !== undefined ? Number(body.variable_count) : undefined, (v) => Number.isFinite(v) && v >= 0 && v <= 10);
    push("is_active", body.is_active, (v) => typeof v === "boolean");
    if (!fields.length) return Response.json({ error: "no valid fields" }, { status: 400 });
    params.push(id);
    if (body.is_active === true) {
      // only one active template per purpose (keep the queue deterministic)
      const purposeRow = await pool.query(`SELECT purpose FROM whatsapp_templates WHERE id = $1`, [id]);
      if ((purposeRow.rowCount ?? 0) > 0 && purposeRow.rows[0].purpose) {
        await pool.query(`UPDATE whatsapp_templates SET is_active = false WHERE purpose = $1`, [purposeRow.rows[0].purpose]);
      }
    }
    await pool.query(`UPDATE whatsapp_templates SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
    return Response.json({ ok: true });
  } catch (e: any) {
    console.error("WhatsApp templates update error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

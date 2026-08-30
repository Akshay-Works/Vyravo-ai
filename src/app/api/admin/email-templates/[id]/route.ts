import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// PUT /api/admin/email-templates/[id] — update
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const name = String(body.name || "").trim();
    const subject = String(body.subject || "").trim();
    const html = String(body.body || "").trim();
    const emailType = String(body.emailType || "campaign").trim();
    if (!name || !subject || !html) {
      return Response.json({ error: "name, subject and body are required" }, { status: 400 });
    }
    const r = await pool.query(
      `UPDATE email_templates
       SET name = $1, email_type = $2, subject = $3, body = $4, updated_at = now()
       WHERE id = $5 RETURNING id, name, email_type, subject, is_active, created_at, updated_at`,
      [name, emailType, subject, html, id]
    );
    if ((r.rowCount ?? 0) === 0) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ template: r.rows[0] });
  } catch (e) {
    console.error("Template update error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

// DELETE /api/admin/email-templates/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const r = await pool.query(`DELETE FROM email_templates WHERE id = $1`, [id]);
    if ((r.rowCount ?? 0) === 0) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (e) {
    console.error("Template delete error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

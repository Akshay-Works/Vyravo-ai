import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/admin/email-templates — list templates
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await pool.query(
      `SELECT id, name, email_type, subject, is_active, created_at, updated_at,
              left(body, 300) AS body_excerpt
       FROM email_templates ORDER BY updated_at DESC`
    );
    return Response.json({ templates: r.rows });
  } catch (e) {
    console.error("Templates list error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/admin/email-templates — create
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const subject = String(body.subject || "").trim();
    const html = String(body.body || "").trim();
    const emailType = String(body.emailType || "campaign").trim();
    if (!name || !subject || !html) {
      return Response.json({ error: "name, subject and body are required" }, { status: 400 });
    }
    const r = await pool.query(
      `INSERT INTO email_templates (name, email_type, subject, body, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id, name, email_type, subject, is_active, created_at, updated_at`,
      [name, emailType, subject, html]
    );
    return Response.json({ template: r.rows[0] }, { status: 201 });
  } catch (e) {
    console.error("Template create error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { renderTemplate, leadToTemplateData } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

// POST /api/admin/email-templates/[id]/queue  { leadIds: number[] }
// Human-approval flow: the admin reviews the rendered preview in the UI,
// then this enqueues the personalized emails into the real email_queue.
// The email worker (npm run email:process / cron) sends them.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const leadIds: number[] = Array.isArray(body.leadIds) ? body.leadIds.map(Number).filter(Boolean) : [];
    if (leadIds.length === 0) return Response.json({ error: "leadIds required" }, { status: 400 });

    const t = await pool.query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
    if ((t.rowCount ?? 0) === 0) return Response.json({ error: "Template not found" }, { status: 404 });
    const template = t.rows[0];

    const l = await pool.query(
      `SELECT * FROM leads
       WHERE id = ANY($1::int[])
         AND email IS NOT NULL AND TRIM(email) <> ''
         AND status NOT IN ('contacted', 'won', 'lost', 'do_not_contact')`,
      [leadIds]
    );
    let queued = 0;
    let skipped = 0;
    for (const lead of l.rows) {
      const data = leadToTemplateData(lead);
      const subject = renderTemplate(template.subject, data);
      const html = renderTemplate(template.body, data, { html: true });
      await pool.query(
        `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data)
         VALUES ($1, $2, now(), 'pending', $3)`,
        [
          lead.id,
          template.email_type,
          JSON.stringify({
            to: lead.email,
            subject,
            html,
            templateId: template.id,
            templateName: template.name,
            leadId: lead.id,
            leadName: lead.full_name || lead.business_name || "",
          }),
        ]
      );
      queued++;
    }
    skipped = leadIds.length - l.rows.length;
    return Response.json({ queued, skipped });
  } catch (e) {
    console.error("Template queue error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

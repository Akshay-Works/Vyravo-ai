import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { renderTemplate, leadToTemplateData, sampleTemplateData } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";

// POST /api/admin/email-templates/[id]/test  { to, leadId?, subject?, body? }
// Sends ONE test email to you (via Resend/Gmail) so you can see exactly
// what the client would receive. Uses unsaved editor values when passed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const to = String(body.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return Response.json({ error: "Enter a valid recipient email." }, { status: 400 });
    }

    const t = await pool.query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
    if ((t.rowCount ?? 0) === 0) return Response.json({ error: "Template not found" }, { status: 404 });
    const template = t.rows[0];

    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject : template.subject;
    const htmlSrc = typeof body.body === "string" && body.body.trim() ? body.body : template.body;

    let data = sampleTemplateData();
    if (body.leadId) {
      const l = await pool.query(`SELECT * FROM leads WHERE id = $1`, [Number(body.leadId)]);
      if ((l.rowCount ?? 0) > 0) data = leadToTemplateData(l.rows[0]);
    }

    const result = await sendEmail({
      to,
      subject: renderTemplate(subject, data),
      html: renderTemplate(htmlSrc, data, { html: true }),
    });

    if (!result.sent) {
      return Response.json({ error: result.error || "Send failed" }, { status: 502 });
    }
    return Response.json({ ok: true, provider: result.provider, to, subject: renderTemplate(subject, data) });
  } catch (e) {
    console.error("Template test-send error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

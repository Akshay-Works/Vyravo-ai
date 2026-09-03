import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { renderTemplate, leadToTemplateData } from "@/lib/email/templates";
import { sendEmail, DEFAULT_REPLY_TO } from "@/lib/email/send";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/admin/email-templates/[id]/test  { leadId, subject?, body? }
// Sends ONE email to the SELECTED LEAD's own email address (resolved on the
// server from the lead row — the client never decides the recipient).
// Reply-To is always the Vyravo admin address (akshay.navale.work@gmail.com);
// it is never used as a fallback recipient.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();

    // 1) A lead must be selected — never send to the admin's own address
    const leadId = Number(body.leadId || 0);
    if (!leadId) return Response.json({ error: "Select a lead first." }, { status: 400 });

    // 2) Resolve the recipient from the lead row stored in the database
    const t = await pool.query(`SELECT * FROM email_templates WHERE id = $1`, [id]);
    if ((t.rowCount ?? 0) === 0) return Response.json({ error: "Template not found" }, { status: 404 });

    const l = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
    if ((l.rowCount ?? 0) === 0) return Response.json({ error: "Lead not found." }, { status: 404 });
    const lead = l.rows[0];

    // 3) Validate the lead's own email — no fallback recipient, ever
    const to = String(lead.email || "").trim().toLowerCase();
    if (!to) return Response.json({ error: "Lead has no email address." }, { status: 400 });
    if (!EMAIL_RE.test(to)) return Response.json({ error: "Lead email address is invalid." }, { status: 400 });

    const template = t.rows[0];
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject : template.subject;
    const htmlSrc = typeof body.body === "string" && body.body.trim() ? body.body : template.body;

    // 4) Personalize with THIS lead's real data
    const data = leadToTemplateData(lead);
    const finalSubject = renderTemplate(subject, data);
    const finalHtml = renderTemplate(htmlSrc, data, { html: true });

    console.log(`[email-test] to=${to} replyTo=${DEFAULT_REPLY_TO} template=${template.name} lead=${leadId}`);
    const result = await sendEmail({
      to,
      subject: finalSubject,
      html: finalHtml,
      replyTo: DEFAULT_REPLY_TO,
    });

    if (!result.sent) {
      return Response.json({ error: result.error || "Send failed" }, { status: 502 });
    }
    return Response.json({ ok: true, provider: result.provider, to, subject: finalSubject, replyTo: DEFAULT_REPLY_TO });
  } catch (e) {
    console.error("Template test-send error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

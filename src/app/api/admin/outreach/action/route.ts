import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { DEFAULT_REPLY_TO } from "@/lib/email/send";
import {
  buildOutreachEmail, sendOutreachNow, queueLead, skipLead, retryLead,
  markReplied, doNotContact, ensureOutreachSchema,
} from "@/lib/outreach/pipeline";
import { getOutreachConfig } from "@/lib/outreach/config";

export const dynamic = "force-dynamic";

// POST /api/admin/outreach/action  { leadId, action, subject?, body? }
// actions: preview | send_now | queue | skip | retry | edit | mark_replied | dnc
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureOutreachSchema();
    const body = await request.json();
    const leadId = Number(body.leadId || 0);
    if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });
    const action = String(body.action || "");
    const cfg = await getOutreachConfig();

    switch (action) {
      case "preview": {
        const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
        if ((lead.rowCount ?? 0) === 0) return Response.json({ error: "Lead not found." }, { status: 404 });
        const ev = await pool.query(
          `SELECT * FROM outreach_events WHERE lead_id = $1 ORDER BY follow_up_number DESC LIMIT 1`, [leadId]);
        let subject: string, html: string, followUpNumber = 0;
        if ((ev.rowCount ?? 0) > 0) {
          subject = ev.rows[0].subject; html = ev.rows[0].body; followUpNumber = ev.rows[0].follow_up_number;
        } else {
          const built = await buildOutreachEmail(lead.rows[0], 0);
          subject = built.subject; html = built.html;
        }
        const email = String(lead.rows[0].email || "").trim();
        return Response.json({
          ok: true,
          to: cfg.test_mode ? cfg.test_recipient : email,
          replyTo: DEFAULT_REPLY_TO,
          subject, html, followUpNumber,
          note: cfg.test_mode ? `TEST MODE — would actually send to ${cfg.test_recipient}` : "",
        });
      }

      case "send_now": {
        const r = await sendOutreachNow(leadId);
        return Response.json(r.ok ? { ok: true, to: r.to } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }

      case "queue": {
        const r = await queueLead(leadId);
        return Response.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }

      case "skip": {
        await skipLead(leadId);
        return Response.json({ ok: true });
      }

      case "retry": {
        const r = await retryLead(leadId);
        return Response.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400 });
      }

      case "edit": {
        // per-lead override on the latest queued email (subject/body)
        const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 300) : "";
        const html = typeof body.html === "string" && body.html.trim() ? body.html : "";
        if (!subject || !html) return Response.json({ error: "subject and html required" }, { status: 400 });
        const ev = await pool.query(
          `UPDATE outreach_events SET subject = $2, body = $3
           WHERE id = (SELECT id FROM outreach_events WHERE lead_id = $1 AND status = 'queued' ORDER BY id DESC LIMIT 1)
           RETURNING id`,
          [leadId, subject, html]
        );
        if ((ev.rowCount ?? 0) === 0) return Response.json({ error: "No queued email to edit (queue it first)." }, { status: 400 });
        await pool.query(
          `UPDATE email_queue SET template_data = template_data || jsonb_build_object('subject', $2, 'html', $3)
           WHERE template_data->>'outreach_event_id' = $1::text AND status = 'pending'`,
          [String(ev.rows[0].id), subject, html]
        );
        return Response.json({ ok: true });
      }

      case "mark_replied": {
        await markReplied(leadId);
        return Response.json({ ok: true });
      }

      case "dnc": {
        await doNotContact(leadId);
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error("Outreach action error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

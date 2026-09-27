import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { sendEmail } from "@/lib/email/send";
import { logDecision } from "@/lib/sales/schema";

export const dynamic = "force-dynamic";

// L2 outbox: AI-drafted emails held for founder approval.
// GET → held items. POST { id, action: approve|send_now|discard, subject?, body? }
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = await pool.query(
    `SELECT q.id, q.lead_id, q.email_type, q.status, q.created_at, q.template_data,
            l.business_name, l.email AS lead_email
     FROM email_queue q LEFT JOIN leads l ON l.id = q.lead_id
     WHERE q.status = 'held' ORDER BY q.id DESC LIMIT 50`);
  return Response.json({ ok: true, held: r.rows });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  const action = String(b.action || "");
  if (!id || !["approve", "send_now", "discard"].includes(action))
    return Response.json({ error: "id + action (approve|send_now|discard) required" }, { status: 400 });
  const row = (await pool.query(`SELECT * FROM email_queue WHERE id = $1 AND status = 'held'`, [id])).rows[0];
  if (!row) return Response.json({ error: "held email not found" }, { status: 404 });
  const d = row.template_data || {};
  const subject = String(b.subject || d.subject || "").slice(0, 200);
  const html = typeof b.body === "string" && b.body.trim() ? b.body.slice(0, 8000) : String(d.html || "");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (action === "discard") {
    await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE id = $1`, [id]);
  } else if (action === "approve") {
    await pool.query(`UPDATE email_queue SET status = 'pending', scheduled_for = now(),
      template_data = template_data || $2 WHERE id = $1`,
      [id, JSON.stringify({ subject, html })]);
  } else {
    const sent = await sendEmail({ to: d.to, subject, html, text });
    if (!sent.sent) return Response.json({ error: sent.error || "send failed" }, { status: 502 });
    await pool.query(`UPDATE email_queue SET status = 'sent', sent_at = now(), template_data = template_data || $2 WHERE id = $1`,
      [id, JSON.stringify({ subject, html })]);
    if (row.lead_id) {
      await pool.query(`UPDATE leads SET last_contacted_at = now() WHERE id = $1`, [row.lead_id]);
      await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','reply_sent',$2,$1,now())`,
        [row.lead_id, `L2 follow-up approved + sent — "${subject.slice(0, 70)}"`]).catch(() => {});
    }
  }
  await pool.query(`UPDATE sales_escalations SET status = 'resolved', resolved_at = now(), resolved_by = 'admin'
    WHERE kind = 'email_approval' AND status = 'open' AND detail LIKE '%#${id}%'`).catch(() => {});
  await logDecision({ lead_id: row.lead_id, trigger_text: `outbox:${action}`, action: `held_${action}`,
    autonomy: "none", reason: `held email #${id} ${action} by admin`, result: action });
  return Response.json({ ok: true, action });
}

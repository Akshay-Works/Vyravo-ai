import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureInboxSchema, auditInbox } from "@/lib/email-intel/schema";
import { sendEmail, DEFAULT_REPLY_TO } from "@/lib/email/send";
import { contactReferral } from "@/lib/email-intel/process";

export const dynamic = "force-dynamic";

// POST /api/admin/inbox/action — { action, message_id?, ... }
// approve_send | save_draft | reject | mark_handled | toggle_auto | approve_contact | ignore_contact
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureInboxSchema();
  const b = await request.json().catch(() => ({}));
  const action = String(b.action || "");
  const messageId = String(b.message_id || "");
  const threadId = String(b.thread_id || "");
  const msg = messageId
    ? (await pool.query(`SELECT * FROM inbox_messages WHERE message_id = $1`, [messageId])).rows[0] : null;

  const wrapHtml = (body: string) =>
    `<div>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .split(/\n{2,}|\r?\n\r?\n/).map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;

  if (action === "approve_send") {
    if (!msg) return Response.json({ error: "message not found" }, { status: 404 });
    if (!["reply_generated", "needs_review", "failed"].includes(msg.status))
      return Response.json({ error: `cannot send from status ${msg.status}` }, { status: 400 });
    const subject = String(b.subject || msg.ai_reply_subject || "").replace(/^\s*(re:\s*)+/i, "").slice(0, 200) || msg.subject;
    const body = String(b.body || msg.ai_reply_body || "");
    if (body.trim().length < 20) return Response.json({ error: "reply body too short" }, { status: 400 });
    const sent = await sendEmail({
      to: msg.from_email, subject: `Re: ${subject}`, html: wrapHtml(body), text: body,
      replyTo: DEFAULT_REPLY_TO,
      headers: { "In-Reply-To": `<${msg.message_id}>`, References: `<${msg.thread_id}> <${msg.message_id}>` },
    });
    if (!sent.sent) return Response.json({ error: sent.error || "send failed" }, { status: 502 });
    await pool.query(
      `INSERT INTO inbox_messages (message_id, thread_id, lead_id, direction, from_email, to_emails, subject, body_text, sent_at, status, sent_message_id, processed_at)
       VALUES ($1,$2,$3,'out',$4,$5,$6,$7,now(),'sent',$8,now()) ON CONFLICT (message_id) DO NOTHING`,
      [`vyravo-manual-${msg.id}-${Date.now()}`, msg.thread_id, msg.lead_id, DEFAULT_REPLY_TO,
       [msg.from_email], `Re: ${subject}`, body, (sent as any).id || null]);
    const due = new Date(Date.now() + 4 * 86400000);
    await pool.query(
      `UPDATE inbox_messages SET status = 'sent', ai_reply_subject = $2, ai_reply_body = $3,
         reviewed_by = 'admin', reviewed_at = now(), sent_message_id = $4, follow_up_due_at = $5 WHERE id = $1`,
      [msg.id, subject, body, (sent as any).id || null, due]);
    if (msg.lead_id) {
      await pool.query(`UPDATE leads SET last_contacted_at = now(), next_follow_up = $2 WHERE id = $1`, [msg.lead_id, due]);
      await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','reply_sent',$2,$1,now())`,
        [msg.lead_id, `Manual reply approved + sent — “${subject.slice(0, 80)}”`]).catch(() => {});
    }
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "sent", actor: "admin", detail: { provider: sent.provider, edited: !!(b.subject || b.body) } });
    return Response.json({ ok: true, provider: sent.provider });
  }

  if (action === "save_draft") {
    if (!msg) return Response.json({ error: "message not found" }, { status: 404 });
    await pool.query(`UPDATE inbox_messages SET ai_reply_subject = $2, ai_reply_body = $3, status = 'reply_generated', reviewed_by = 'admin', reviewed_at = now() WHERE id = $1`,
      [msg.id, String(b.subject || "").slice(0, 200), String(b.body || "").slice(0, 4000)]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action: "draft_saved", actor: "admin", detail: {} });
    return Response.json({ ok: true });
  }

  if (action === "reject" || action === "mark_handled") {
    if (!msg) return Response.json({ error: "message not found" }, { status: 404 });
    await pool.query(`UPDATE inbox_messages SET status = $2, reviewed_by = 'admin', reviewed_at = now() WHERE id = $1`,
      [msg.id, action === "reject" ? "ignored" : "processed"]);
    await auditInbox({ message_id: msg.message_id, thread_id: msg.thread_id, lead_id: msg.lead_id, action, actor: "admin", detail: {} });
    return Response.json({ ok: true });
  }

  if (action === "toggle_auto") {
    if (!threadId) return Response.json({ error: "thread_id required" }, { status: 400 });
    const on = b.auto_reply !== false;
    await pool.query(`INSERT INTO inbox_thread_prefs (thread_id, auto_reply, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (thread_id) DO UPDATE SET auto_reply = $2, updated_at = now()`, [threadId, on]);
    await auditInbox({ thread_id: threadId, action: "thread_auto_toggled", actor: "admin", detail: { auto_reply: on } });
    return Response.json({ ok: true, auto_reply: on });
  }

  if (action === "approve_contact") {
    const cid = Number(b.contact_id);
    const c = cid ? (await pool.query(`SELECT * FROM inbox_contacts WHERE id = $1`, [cid])).rows[0] : null;
    if (!c) return Response.json({ error: "contact not found" }, { status: 404 });
    if (c.status === "contacted") return Response.json({ ok: true, already: true });
    const src = (await pool.query(`SELECT * FROM inbox_messages WHERE message_id = $1`, [c.message_id])).rows[0];
    try {
      await contactReferral(
        { message_id: c.message_id, from_name: src?.from_name || null, from_email: src?.from_email || "unknown" },
        null,
        { email: c.email, name: c.name, title: c.title, company: c.company, phone: c.phone, linkedin: c.linkedin,
          relationship: c.relationship, reason: c.reason, confidence: Number(c.confidence) || 0.9, recommended_action: "contact" });
      return Response.json({ ok: true });
    } catch (e: any) {
      return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 502 });
    }
  }

  if (action === "ignore_contact") {
    const cid = Number(b.contact_id);
    await pool.query(`UPDATE inbox_contacts SET status = 'ignored' WHERE id = $1`, [cid]);
    await auditInbox({ action: "contact_ignored", actor: "admin", detail: { contact_id: cid } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}

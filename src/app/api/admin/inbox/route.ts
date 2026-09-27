import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureInboxSchema } from "@/lib/email-intel/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/inbox?queue=needs_reply — queue counts + message list.
// GET /api/admin/inbox?thread=<thread_id> — full thread + contacts + audit.
const QUEUES: Record<string, string> = {
  needs_reply: "m.status IN ('new','processing')",
  review: "m.status = 'needs_review'",
  drafts: "m.status = 'reply_generated'",
  sent: "m.status = 'sent'",
  failed: "m.status = 'failed'",
  ignored: "m.status IN ('ignored','processed')",
};

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureInboxSchema();
  const url = new URL(request.url);
  const queue = url.searchParams.get("queue") || "needs_reply";
  const thread = url.searchParams.get("thread") || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  const counts: Record<string, number> = {};
  for (const [k, cond] of Object.entries(QUEUES)) {
    const r = await pool.query(`SELECT count(*)::int n FROM inbox_messages m WHERE m.direction = 'in' AND ${cond}`);
    counts[k] = r.rows[0]?.n || 0;
  }
  const rc = await pool.query(`SELECT count(*)::int n FROM inbox_contacts WHERE status = 'new'`);
  counts.contacts = rc.rows[0]?.n || 0;
  const fd = await pool.query(`SELECT count(*)::int n FROM inbox_messages WHERE direction = 'in' AND follow_up_due_at IS NOT NULL`);
  counts.followups = fd.rows[0]?.n || 0;

  if (thread) {
    const msgs = await pool.query(
      `SELECT m.*, l.business_name, l.email AS lead_email FROM inbox_messages m
       LEFT JOIN leads l ON l.id = m.lead_id WHERE m.thread_id = $1 ORDER BY m.id`, [thread]);
    const contacts = await pool.query(
      `SELECT c.* FROM inbox_contacts c WHERE c.message_id = ANY(
         SELECT message_id FROM inbox_messages WHERE thread_id = $1) ORDER BY c.id`, [thread]);
    const audit = await pool.query(`SELECT * FROM inbox_audit WHERE thread_id = $1 ORDER BY id DESC LIMIT 60`, [thread]);
    const pref = await pool.query(`SELECT * FROM inbox_thread_prefs WHERE thread_id = $1`, [thread]);
    return Response.json({
      ok: true, counts, thread, messages: msgs.rows, contacts: contacts.rows, audit: audit.rows,
      pref: pref.rows[0] || { thread_id: thread, auto_reply: true },
    });
  }
  const where = QUEUES[queue] || QUEUES.needs_reply;
  const msgs = await pool.query(
    `SELECT m.*, l.business_name, l.email AS lead_email FROM inbox_messages m
     LEFT JOIN leads l ON l.id = m.lead_id
     WHERE m.direction = 'in' AND ${where} ORDER BY m.id DESC LIMIT $1`, [limit]);
  const audit = await pool.query(`SELECT * FROM inbox_audit ORDER BY id DESC LIMIT 30`);
  const contacts = queue === "review" || queue === "drafts"
    ? (await pool.query(`SELECT * FROM inbox_contacts WHERE status = 'new' ORDER BY id DESC LIMIT 60`)).rows : [];
  return Response.json({ ok: true, counts, queue, messages: msgs.rows, contacts, audit: audit.rows });
}

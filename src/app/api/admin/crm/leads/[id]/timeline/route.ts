import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { stageLabel } from "@/lib/sales/stages";

export const dynamic = "force-dynamic";

// GET /api/admin/crm/leads/[id]/timeline — chronological activity timeline:
// communication events (sales stage = commercial state, timeline = what happened).
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const leadId = Number(id);
  if (!leadId) return Response.json({ error: "bad id" }, { status: 400 });

  const lead = (await pool.query(
    `SELECT id, full_name, business_name, email, phone, city, stage, status, lead_score,
            deal_value, deal_currency, next_action, next_action_date, created_at,
            first_contacted_at, first_contact_channel, replied_at, last_contacted_at
     FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) return Response.json({ error: "lead not found" }, { status: 404 });
  lead.stage_label = stageLabel(lead.stage || "new");

  const items: any[] = [];
  const push = (rows: any[], map: (r: any) => any) => { for (const r of rows) { try { items.push(map(r)); } catch {} } };

  const act = await pool.query(
    `SELECT action, description, created_at FROM activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(act.rows, (r) => ({ at: r.created_at, kind: "activity", title: r.action, detail: r.description }));

  const dec = await pool.query(
    `SELECT trigger_text, from_stage, to_stage, action, autonomy, reason, result, created_at
     FROM sales_decisions WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(dec.rows, (r) => ({ at: r.created_at, kind: "decision", title: r.action, detail: `${r.from_stage || ""}${r.to_stage ? ` → ${r.to_stage}` : ""} ${r.reason || ""} [${r.autonomy}]`.trim() }));

  const ev = await pool.query(
    `SELECT event_type, payload, result, created_at FROM sales_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 100`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(ev.rows, (r) => ({ at: r.created_at, kind: "lifecycle", title: r.event_type, detail: r.result || "" }));

  const mail = await pool.query(
    `SELECT direction, subject, from_email, classification, status, sent_at, processed_at, created_at
     FROM inbox_messages WHERE lead_id = $1 ORDER BY COALESCE(sent_at, processed_at, created_at) DESC LIMIT 60`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(mail.rows, (r) => ({ at: r.sent_at || r.processed_at || r.created_at, kind: r.direction === "out" ? "email_out" : "email_in",
    title: r.direction === "out" ? "Email sent" : "Email received", detail: `${r.subject || ""}${r.classification ? ` [${r.classification}]` : ""}`.trim() }));

  const out = await pool.query(
    `SELECT follow_up_number, status, subject, sent_at, created_at FROM outreach_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 40`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(out.rows, (r) => ({ at: r.sent_at || r.created_at, kind: "outreach", title: `Outreach #${r.follow_up_number} — ${r.status}`, detail: r.subject || "" }));

  const props = await pool.query(
    `SELECT id, title, status, created_at, updated_at FROM proposals WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(props.rows, (r) => ({ at: r.updated_at || r.created_at, kind: "proposal", title: `Proposal #${r.id} — ${r.status}`, detail: r.title || "" }));

  const invs = await pool.query(
    `SELECT id, invoice_no, amount, currency, status, paid_at, created_at FROM sales_invoices WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(invs.rows, (r) => ({ at: r.paid_at || r.created_at, kind: "invoice", title: `Invoice ${r.invoice_no} — ${r.status}`, detail: `${r.currency} ${r.amount}` }));

  const escs = await pool.query(
    `SELECT id, kind, title, status, created_at FROM sales_escalations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`, [leadId]).catch(() => ({ rows: [] as any[] }));
  push(escs.rows, (r) => ({ at: r.created_at, kind: "escalation", title: `#${r.id} ${r.title}`, detail: `${r.kind} — ${r.status}` }));

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return Response.json({ ok: true, lead, timeline: items.slice(0, 200) });
}

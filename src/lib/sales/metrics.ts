// ============================================================================
// SALES OS — metrics engine (§3/§10/§24). Every number from real tables, one
// place, shared by the command center, the daily report, and (later) the
// experiment engine. Day filter is a DATE param (UTC); revenue figures always
// carry their currency breakdown (never silently sum mixed currencies).
// ============================================================================
import { pool } from "@/db";

export async function getSalesMetrics(day?: string): Promise<any> {
  const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "CURRENT_DATE";
  const lit = d === "CURRENT_DATE" ? "CURRENT_DATE" : `'${d}'::date`;
  const one = async (sql: string) => Number((await pool.query(sql)).rows[0]?.n || 0);

  const today = {
    new_leads: await one(`SELECT count(*)::int n FROM leads WHERE created_at::date = ${lit}`),
    contacted: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at::date = ${lit}`),
    replies: await one(`SELECT count(*)::int n FROM activities WHERE action = 'replied' AND created_at::date = ${lit}`),
    positive_replies: await one(`SELECT count(*)::int n FROM inbox_messages WHERE direction = 'in' AND classification IN ('positive_interest','meeting_request','pricing_request','question','referral','introduction') AND created_at::date = ${lit}`),
    qualified: await one(`SELECT count(*)::int n FROM sales_decisions WHERE to_stage = 'qualified' AND created_at::date = ${lit}`),
    meetings_booked: await one(`SELECT count(*)::int n FROM meetings WHERE created_at::date = ${lit}`),
    proposals_created: await one(`SELECT count(*)::int n FROM proposals WHERE created_at::date = ${lit}`),
    proposals_sent: await one(`SELECT count(*)::int n FROM proposal_events WHERE event_type = 'sent' AND created_at::date = ${lit}`),
    won: await one(`SELECT count(*)::int n FROM sales_decisions WHERE to_stage = 'won' AND created_at::date = ${lit}`),
    lost: await one(`SELECT count(*)::int n FROM sales_decisions WHERE to_stage IN ('lost','not_interested','unqualified') AND created_at::date = ${lit}`),
  };
  const ai = {
    emails_sent: await one(`SELECT count(*)::int n FROM inbox_messages WHERE direction = 'out' AND status = 'sent' AND processed_at::date = ${lit}`),
    replies_handled: await one(`SELECT count(*)::int n FROM inbox_messages WHERE direction = 'in' AND status IN ('sent','processed','ignored','reply_generated','needs_review') AND processed_at::date = ${lit}`),
    followups_sent: await one(`SELECT count(*)::int n FROM outreach_events WHERE status = 'sent' AND follow_up_number > 0 AND sent_at::date = ${lit}`),
    leads_researched: await one(`SELECT count(*)::int n FROM sales_decisions WHERE action = 'researched' AND created_at::date = ${lit}`),
    contacts_discovered: await one(`SELECT count(*)::int n FROM inbox_contacts WHERE created_at::date = ${lit}`),
    meetings_booked: today.meetings_booked,
    proposals_generated: await one(`SELECT count(*)::int n FROM proposals WHERE generated_by_ai = true AND created_at::date = ${lit}`),
    escalated: await one(`SELECT count(*)::int n FROM sales_escalations WHERE created_at::date = ${lit}`),
  };
  const funnelRows = await pool.query(
    `SELECT COALESCE(stage, 'new') s, count(*)::int n FROM leads GROUP BY 1 ORDER BY 2 DESC`);
  const funnel: Record<string, number> = {};
  for (const r of funnelRows.rows) funnel[r.s] = r.n;
  const rev = await pool.query(
    `SELECT currency, count(*)::int n, COALESCE(sum(total),0)::numeric t FROM proposals WHERE status = 'accepted' GROUP BY 1`);
  const pipe = await pool.query(
    `SELECT currency, count(*)::int n, COALESCE(sum(total),0)::numeric t FROM proposals WHERE status IN ('sent','viewed','in_review','approved') GROUP BY 1`);
  const pause = await pool.query(`SELECT v FROM outreach_config WHERE k = 'sales_paused'`);
  return { day: d === "CURRENT_DATE" ? "today" : d, today, ai, funnel,
    revenue_accepted: rev.rows, pipeline_value: pipe.rows,
    paused: String(pause.rows[0]?.v || "").toLowerCase() === "true" };
}

export async function getFounderActions(limit = 20): Promise<any[]> {
  const r = await pool.query(
    `SELECT e.*, l.business_name, l.email AS lead_email, l.lead_score, l.stage
     FROM sales_escalations e LEFT JOIN leads l ON l.id = e.lead_id
     WHERE e.status = 'open' ORDER BY e.created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

export async function getRecentFailures(limit = 10): Promise<any[]> {
  const out: any[] = [];
  const q = await pool.query(
    `SELECT id, lead_id, template_data->>'error' AS error, template_data->>'to' AS recipient
     FROM email_queue WHERE status = 'failed' ORDER BY id DESC LIMIT $1`, [limit]);
  for (const r of q.rows) out.push({ source: "email_queue", id: r.id, lead_id: r.lead_id, error: r.error || "send failed", context: r.recipient });
  const e = await pool.query(
    `SELECT id, lead_id, error_message FROM outreach_events WHERE status = 'failed' ORDER BY id DESC LIMIT $1`, [limit]);
  for (const r of e.rows) out.push({ source: "outreach_events", id: r.id, lead_id: r.lead_id, error: r.error_message || "failed", context: null });
  const m = await pool.query(
    `SELECT id, lead_id, error_message FROM inbox_messages WHERE status = 'failed' ORDER BY id DESC LIMIT $1`, [limit]);
  for (const r of m.rows) out.push({ source: "inbox", id: r.id, lead_id: r.lead_id, error: r.error_message || "failed", context: null });
  return out.slice(0, limit);
}

export async function getTomorrowQueue(): Promise<any> {
  const r = await pool.query(
    `SELECT count(*) FILTER (WHERE template_data->>'outreach_event_id' IS NOT NULL)::int AS outreach_pending,
            count(*) FILTER (WHERE template_data->>'outreach_event_id' IS NULL)::int AS generic_pending
     FROM email_queue WHERE status = 'pending'`);
  return r.rows[0] || { outreach_pending: 0, generic_pending: 0 };
}

export async function getBestOpportunities(limit = 5): Promise<any[]> {
  const r = await pool.query(
    `SELECT id, business_name, email, stage, lead_score, budget_range, timeline
     FROM leads WHERE COALESCE(stage, 'new') IN ('engaged','qualified','meeting_booked','discovery_completed','proposal_sent','negotiation')
     ORDER BY lead_score DESC NULLS LAST, id DESC LIMIT $1`, [limit]);
  return r.rows;
}

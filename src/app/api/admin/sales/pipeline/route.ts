import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ACTIVE_STAGES, TERMINAL_STAGES, stageLabel } from "@/lib/sales/stages";

export const dynamic = "force-dynamic";

// GET /api/admin/sales/pipeline — visual pipeline counts + stuck-lead spotlight.
export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const counts = await pool.query(
    `SELECT COALESCE(stage,'new') AS stage, count(*)::int AS n,
            COALESCE(sum(deal_value),0)::numeric AS value
     FROM leads GROUP BY 1`);
  const byStage = new Map<string, { n: number; value: number }>();
  for (const r of counts.rows) byStage.set(r.stage, { n: r.n, value: Number(r.value) });

  const active = ACTIVE_STAGES.map((s) => ({
    stage: s, label: stageLabel(s),
    count: byStage.get(s)?.n || 0, value: byStage.get(s)?.value || 0,
  }));
  const inactive = TERMINAL_STAGES.map((s) => ({
    stage: s, label: stageLabel(s),
    count: byStage.get(s)?.n || 0, value: byStage.get(s)?.value || 0,
  }));

  // Stuck: active-stage leads whose next_action_date passed or with no activity in 7d.
  const stuck = await pool.query(
    `SELECT l.id, l.business_name, l.email, l.stage, l.next_action, l.next_action_date, l.lead_score,
            (SELECT max(created_at) FROM activities a WHERE a.lead_id = l.id) AS last_activity
     FROM leads l
     WHERE COALESCE(l.stage,'new') NOT IN (${TERMINAL_STAGES.map((_, i) => `$${i + 1}`).join(",")})
       AND (l.next_action_date < now() OR l.last_contacted_at < now() - interval '7 days' OR l.last_contacted_at IS NULL)
     ORDER BY l.lead_score DESC NULLS LAST LIMIT 15`,
    [...TERMINAL_STAGES]);

  const revenue = await pool.query(
    `SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'),0)::numeric AS collected,
            COALESCE(sum(amount) FILTER (WHERE status IN ('sent','pending')),0)::numeric AS pending
     FROM sales_invoices`).catch(() => ({ rows: [{ collected: 0, pending: 0 }] }));

  return Response.json({
    ok: true, active, inactive, stuck: stuck.rows,
    revenue: { collected: Number(revenue.rows[0]?.collected || 0), pending: Number(revenue.rows[0]?.pending || 0) },
  });
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getSalesMetrics, getFounderActions, getRecentFailures, getTomorrowQueue, getBestOpportunities } from "@/lib/sales/metrics";

export const dynamic = "force-dynamic";

// GET /api/admin/sales/report?day=YYYY-MM-DD (default: yesterday) — daily sales report.
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ||
    new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [metrics, actions, failures, tomorrow, opportunities] = await Promise.all([
    getSalesMetrics(day), getFounderActions(20), getRecentFailures(10), getTomorrowQueue(), getBestOpportunities(5),
  ]);
  return Response.json({ ok: true, report: {
    day, headline: metrics.today, ai_activity: metrics.ai,
    best_opportunities: opportunities,
    founder_actions_required: actions.map((a: any) => ({ id: a.id, kind: a.kind, title: a.title, recommendation: a.recommendation, lead: a.business_name || a.lead_email })),
    problems_detected: failures,
    tomorrow_priorities: { queued_outreach: tomorrow.outreach_pending, queued_generic: tomorrow.generic_pending,
      open_escalations: actions.length, funnel: metrics.funnel },
    revenue_accepted: metrics.revenue_accepted, pipeline_value: metrics.pipeline_value,
  } });
}

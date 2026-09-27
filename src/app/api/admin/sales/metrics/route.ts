import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getSalesMetrics, getFounderActions, getRecentFailures, getTomorrowQueue, getBestOpportunities } from "@/lib/sales/metrics";

export const dynamic = "force-dynamic";

// GET /api/admin/sales/metrics?day=YYYY-MM-DD — command center data (one call).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const day = url.searchParams.get("day") || undefined;
  const [metrics, actions, failures, tomorrow, opportunities] = await Promise.all([
    getSalesMetrics(day), getFounderActions(20), getRecentFailures(10), getTomorrowQueue(), getBestOpportunities(5),
  ]);
  return Response.json({ ok: true, metrics, actions, failures, tomorrow, opportunities });
}

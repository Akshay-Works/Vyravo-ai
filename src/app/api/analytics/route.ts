import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getDashboard, getRevenueByService, getLeadTrends, getRevenueTrend, getRecentActivity, getAlerts } from "@/lib/analytics/engine";

export const dynamic = "force-dynamic";

// GET /api/analytics?period=30d&from=&to=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const section = searchParams.get("section") || "all";

    const filter = { period: period as any, from, to };
    const data: any = {};

    if (section === "all" || section === "overview") {
      Object.assign(data, await getDashboard(filter));
      data.leadTrends = await getLeadTrends(filter);
      data.revenueTrend = await getRevenueTrend(filter);
    }
    if (section === "all" || section === "activity") data.activity = await getRecentActivity();
    if (section === "all" || section === "alerts") data.alerts = await getAlerts();
    if (section === "all" || section === "services") data.services = await getRevenueByService();

    return Response.json(data);
  } catch (e) {
    console.error("Analytics API error:", e);
    return Response.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

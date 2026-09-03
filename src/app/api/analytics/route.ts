import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getDashboard, getRevenueByService, getLeadTrends, getRevenueTrend, getRecentActivity, getAlerts } from "@/lib/analytics/engine";
import { getFunnel2Analytics, getEngineLeadsAnalytics } from "@/lib/analytics/funnel2";

export const dynamic = "force-dynamic";

// GET /api/analytics?period=30d&from=&to=
// Each section is isolated: one failing section never blanks the others
// (the dashboard must keep returning funnel2 + engine even if e.g. the
// overview aggregation hits a hiccup).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "30d";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const section = searchParams.get("section") || "all";

  const filter = { period: period as any, from, to };
  const data: any = {};
  const errors: string[] = [];
  const section_ = async (key: string, fn: () => Promise<any>) => {
    try { data[key] = await fn(); } catch (e: any) {
      console.error(`Analytics section ${key} failed:`, e);
      errors.push(key);
      data[key] = null;
    }
  };

  if (section === "all" || section === "overview") {
    await section_("dashboard", async () => {
      const dash: any = await getDashboard(filter);
      dash.leadTrends = await getLeadTrends(filter);
      dash.revenueTrend = await getRevenueTrend(filter);
      return dash;
    });
  }
  if (section === "all" || section === "activity") await section_("activity", () => getRecentActivity());
  if (section === "all" || section === "alerts") await section_("alerts", () => getAlerts());
  if (section === "all" || section === "services") await section_("services", () => getRevenueByService());
  if (section === "all" || section === "funnel2") {
    await section_("funnel2", () => getFunnel2Analytics(filter));
    await section_("engine", () => getEngineLeadsAnalytics(filter));
  }

  if (data.dashboard) {
    const { leadTrends, revenueTrend, ...rest } = data.dashboard;
    Object.assign(data, rest);
    if (leadTrends !== undefined) data.leadTrends = leadTrends;
    if (revenueTrend !== undefined) data.revenueTrend = revenueTrend;
    delete data.dashboard;
  }
  if (errors.length) data.sectionErrors = errors;

  return Response.json(data);
}

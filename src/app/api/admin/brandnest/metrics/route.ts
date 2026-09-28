import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getBrandNestMetrics, getRevenueSplit } from "@/lib/brandnest/metrics";

export const dynamic = "force-dynamic";

// GET /api/admin/brandnest/metrics — BrandNest dashboard + separated revenue.
export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [metrics, revenue] = await Promise.all([getBrandNestMetrics(), getRevenueSplit()]);
  return Response.json({ ok: true, ...metrics, revenueSplit: revenue });
}

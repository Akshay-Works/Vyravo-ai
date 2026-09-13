import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { trends, type TrendRange } from "@/lib/activity/tier2";
import { tier2Filters } from "../replies/route";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/trends?range=7d|30d|month|prev-month|custom|today&from=&to=&...
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(request.url).searchParams;
    const range = (q.get("range") || "30d") as TrendRange;
    if (!["today", "7d", "30d", "month", "prev-month", "custom"].includes(range)) {
      return Response.json({ error: "bad range" }, { status: 400 });
    }
    return Response.json(await trends(range, q.get("from") || undefined, q.get("to") || undefined, tier2Filters(q)));
  } catch (e: any) {
    console.error("Tier2 trends error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

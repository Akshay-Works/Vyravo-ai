import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { outreachFunnel, type FunnelRange } from "@/lib/activity/events";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/funnel?range=30d|today|7d|month|custom&from=&to=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(request.url).searchParams;
    const range = (q.get("range") || "30d") as FunnelRange;
    if (!["today", "7d", "30d", "month", "custom"].includes(range)) return Response.json({ error: "bad range" }, { status: 400 });
    return Response.json(await outreachFunnel(range, q.get("from") || undefined, q.get("to") || undefined));
  } catch (e: any) {
    console.error("Activity funnel error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { dayDetail } from "@/lib/activity/events";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/day?date=2026-09-12 — drill-down: counts + underlying rows
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const d = new URL(request.url).searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return Response.json({ error: "bad date" }, { status: 400 });
    return Response.json(await dayDetail(d));
  } catch (e: any) {
    console.error("Activity day error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { monthCalendar } from "@/lib/activity/events";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/calendar?month=2026-09 — per-day sales activity counts
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const m = new URL(request.url).searchParams.get("month") || "";
    const mt = /^(\d{4})-(\d{2})$/.exec(m);
    const now = new Date();
    const year = mt ? Number(mt[1]) : now.getFullYear();
    const month = mt ? Number(mt[2]) : now.getMonth() + 1;
    if (month < 1 || month > 12) return Response.json({ error: "bad month" }, { status: 400 });
    return Response.json(await monthCalendar(year, month));
  } catch (e: any) {
    console.error("Activity calendar error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

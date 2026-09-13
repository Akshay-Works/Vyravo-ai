import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { dailyPerformance } from "@/lib/activity/events";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/daily — today vs previous 7-day average
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await dailyPerformance());
  } catch (e: any) {
    console.error("Activity daily error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

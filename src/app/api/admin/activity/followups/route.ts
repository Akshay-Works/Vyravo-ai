import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { followupMonitor } from "@/lib/activity/events";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/followups — monitor the AUTOMATED follow-up system (read-only)
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await followupMonitor());
  } catch (e: any) {
    console.error("Activity followups error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

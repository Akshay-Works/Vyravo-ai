import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getOutreachDashboard, ensureOutreachSchema, ensureOutreachTemplates } from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";

// GET /api/admin/outreach — outreach dashboard (stats + event list + config)
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureOutreachSchema();
    await ensureOutreachTemplates();
    return Response.json(await getOutreachDashboard());
  } catch (e: any) {
    console.error("Outreach dashboard error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

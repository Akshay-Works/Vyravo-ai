import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { insights } from "@/lib/activity/tier2";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/insights — data-backed insights (gated by sample size)
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await insights());
  } catch (e: any) {
    console.error("Tier2 insights error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

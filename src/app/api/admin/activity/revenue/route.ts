import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { revenue } from "@/lib/activity/tier2";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/revenue — MRR / pipeline / won / lost (client+proposal scoped)
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await revenue());
  } catch (e: any) {
    console.error("Tier2 revenue error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

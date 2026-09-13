import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { forecast } from "@/lib/activity/tier3";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await forecast());
  } catch (e: any) {
    console.error("Tier3 forecast error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

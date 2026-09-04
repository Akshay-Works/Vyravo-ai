import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getLinkedInDashboard, ensureLinkedInSchema } from "@/lib/linkedin/pipeline";

export const dynamic = "force-dynamic";

// GET /api/admin/linkedin?status=awaiting_approval&today=1 — LinkedIn outreach
// queue + analytics + config (admin only, same auth as the email outreach).
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureLinkedInSchema();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const today = url.searchParams.get("today") === "1";
    return Response.json(await getLinkedInDashboard({ status, today }));
  } catch (e: any) {
    console.error("LinkedIn outreach dashboard error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { suggestReactivation, setReactivation, createReactivationTask, scoreAllReactivation, draftReactivationEmail } from "@/lib/brandnest/reactivate";

export const dynamic = "force-dynamic";

// GET ?leadId= → suggestion. POST { leadId?, action: set|task|score_all|draft, status?, note? }.
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const leadId = Number(new URL(request.url).searchParams.get("leadId"));
  if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });
  return Response.json({ ok: true, ...(await suggestReactivation(leadId)) });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json().catch(() => ({}));
    if (b.action === "score_all") {
      const r = await scoreAllReactivation();
      return Response.json({ ok: true, ...r });
    }
    if (!Number(b.leadId)) return Response.json({ error: "leadId required" }, { status: 400 });
    if (b.action === "draft") {
      const r = await draftReactivationEmail(Number(b.leadId));
      if (!r.id) return Response.json({ ok: false, skipped: r.skipped });
      return Response.json({ ok: true, ...r });
    }
    if (b.action === "task") {
      const r = await createReactivationTask(Number(b.leadId), b.note);
      return Response.json({ ok: true, ...r });
    }
    await setReactivation(Number(b.leadId), b.status || "manual_review");
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

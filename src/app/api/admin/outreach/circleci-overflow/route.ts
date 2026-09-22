import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { triggerCircleCIOverflow } from "@/lib/outreach/circleci-overflow";

export const dynamic = "force-dynamic";

// POST /api/admin/outreach/circleci-overflow — manually trigger the dormant
// CircleCI engine mirror (e.g. first live test with send=0, or an emergency
// re-run). Body: { daily?, funnel2?, foreign?, send? } — all default true/1
// except send which defaults to "0" (queue only) for safety.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const cci = (process.env.CIRCLECI_API_TOKEN || "").trim();
  if (!cci) return Response.json({ error: "CIRCLECI_API_TOKEN is not set on the Vercel project — see work/circleci-setup-checklist.md" }, { status: 503 });
  let body: any = {};
  try { body = await request.json(); } catch {}
  const params = {
    run_daily: body.daily !== false,
    run_funnel2: body.funnel2 !== false,
    run_foreign: body.foreign !== false,
    send: body.send === "1" || body.send === 1 ? "1" : "0",
  };
  const t = await triggerCircleCIOverflow(cci, params);
  if (!t.ok) return Response.json({ error: t.error }, { status: 502 });
  return Response.json({ ok: true, pipeline: t.number ?? t.id, params });
}

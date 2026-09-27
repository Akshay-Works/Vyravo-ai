import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { advanceStage, ALL_STAGES, stageLabel } from "@/lib/sales/stages";
import { logDecision } from "@/lib/sales/schema";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/override { leadId, to, reason? } — founder manual
// override. Always logged (actor=admin); force=true so terminals can revive.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const leadId = Number(b.leadId);
  const to = String(b.to || "").toLowerCase().trim();
  if (!leadId || !(ALL_STAGES as readonly string[]).includes(to))
    return Response.json({ error: "leadId + valid 'to' stage required" }, { status: 400 });
  const reason = String(b.reason || "manual founder override").slice(0, 300);
  const r = await advanceStage(leadId, to, reason, { actor: "admin", force: true, trigger: "override" });
  await logDecision({
    lead_id: leadId, trigger_text: "override", from_stage: r.from, to_stage: r.to,
    action: "manual_override", autonomy: "none", reason, result: r.moved ? "moved" : "already",
  });
  return Response.json({ ok: true, ...r, label: stageLabel(r.to) });
}

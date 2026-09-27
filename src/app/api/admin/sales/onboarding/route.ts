import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { completeOnboarding } from "@/lib/sales/onboarding";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/onboarding { leadId, reason? } — founder confirms the
// onboarding checklist is done → client becomes active_client (logged).
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const leadId = Number(b.leadId);
  if (!leadId) return Response.json({ error: "leadId required" }, { status: 400 });
  await completeOnboarding(leadId, "admin", String(b.reason || "founder confirmed onboarding complete").slice(0, 200));
  return Response.json({ ok: true, leadId, stage: "active_client" });
}

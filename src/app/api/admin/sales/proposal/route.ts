import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { generateSalesProposal } from "@/lib/sales/deals";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/proposal — { lead_id, requirements?, services?, goals?, notes? }
// Generates a DRAFT proposal (L2: founder approves in Proposals before send).
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const leadId = Number(b.lead_id);
  if (!leadId) return Response.json({ error: "lead_id required" }, { status: 400 });
  try {
    const r = await generateSalesProposal(leadId, {
      requirements: Array.isArray(b.requirements) ? b.requirements : undefined,
      services: Array.isArray(b.services) ? b.services : undefined,
      goals: Array.isArray(b.goals) ? b.goals : undefined,
      notes: typeof b.notes === "string" ? b.notes : undefined,
    });
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

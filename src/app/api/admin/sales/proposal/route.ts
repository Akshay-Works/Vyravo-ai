import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { generateSalesProposal } from "@/lib/sales/deals";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/proposal — { lead_id, requirements?, services?, goals?, notes?, send? }
// Default: DRAFT proposal (L2: founder approves in Proposals before send).
// send=true: ONE-CLICK — the founder's click IS the approval: draft → approved → emailed → proposal_sent.
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
    if (!b.send) return Response.json({ ok: true, ...r });
    // ONE-CLICK: founder's click approves + sends immediately.
    const { getProposal, setProposalStatus, recordEvent } = await import("@/lib/proposals/engine");
    const { buildProposalEmailPayload, sendProposalEmail } = await import("@/lib/proposals/email");
    await setProposalStatus(r.proposalId, "approved");
    const data = await getProposal(r.proposalId);
    let emailed = false;
    if (data?.proposal?.clientEmail) {
      const res = await sendProposalEmail(buildProposalEmailPayload(data.proposal, "proposal_sent"));
      emailed = res?.webhook === "sent" || !!res?.queued;
      if (!emailed) return Response.json({ ok: true, ...r, sent: false, error: "email failed — proposal approved, not sent" });
    }
    await setProposalStatus(r.proposalId, "sent");
    await recordEvent(r.proposalId, "sent", { emailed, oneClick: true }).catch(() => {});
    try {
      const { emitSalesEvent } = await import("@/lib/sales/lifecycle");
      await emitSalesEvent({ key: `proposal-sent-${r.proposalId}`, type: "PROPOSAL_SENT", leadId, payload: { proposalId: r.proposalId } });
    } catch {}
    return Response.json({ ok: true, ...r, sent: true, emailed });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

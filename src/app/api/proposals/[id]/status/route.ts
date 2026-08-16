import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposal, setProposalStatus } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

const CRM_STAGES: Record<string, string[]> = {
  generated: ["Proposal Generated", "Qualification"],
  sent: ["Proposal Sent", "Proposal Generated"],
  viewed: ["Proposal Viewed", "Proposal Sent"],
  accepted: ["Proposal Accepted", "Contract Sent"],
  rejected: ["Closed Lost"],
  changes_requested: ["Proposal Sent"],
};

// POST /api/proposals/[id]/status — transition status (approve, view, accept…)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    const proposalId = Number(id);
    const body = await request.json();
    const status = body.status as string;
    const allowed = ["draft", "in_review", "approved", "sent", "viewed", "accepted", "rejected", "changes_requested", "expired", "archived"];
    if (!allowed.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    await setProposalStatus(proposalId, status as any);

    // Best-effort CRM sync
    try {
      const data = await getProposal(proposalId);
      if (data?.proposal.clientEmail && CRM_STAGES[status]) {
        const { updateDealStageForEmail } = await import("@/lib/integrations/hubspot");
        await updateDealStageForEmail(data.proposal.clientEmail, CRM_STAGES[status]);
      }
    } catch (e) {
      console.warn("CRM stage sync failed:", e);
    }

    return Response.json({ success: true, status });
  } catch (e) {
    console.error("Status transition error:", e);
    return Response.json({ error: "Failed to update status" }, { status: 500 });
  }
}

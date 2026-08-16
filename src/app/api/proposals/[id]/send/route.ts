import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposal, setProposalStatus, recordEvent } from "@/lib/proposals/engine";
import { buildProposalEmailPayload, sendProposalEmail } from "@/lib/proposals/email";
import { emitEvent } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/send — mark sent, email the client, start follow-ups
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
    const data = await getProposal(proposalId);
    if (!data) return Response.json({ error: "Proposal not found" }, { status: 404 });
    const p = data.proposal;

    // Human-approval guard: AI-generated proposals must be approved before sending
    if (p.generatedByAi && p.status === "draft") {
      return Response.json(
        { error: "This AI-generated proposal is still a draft. Set its status to 'Approved' (human review) before sending." },
        { status: 422 }
      );
    }

    await setProposalStatus(proposalId, "sent");

    // Email the client (best-effort)
    let emailResult = null;
    if (p.clientEmail) {
      emailResult = await sendProposalEmail(buildProposalEmailPayload(p, "proposal_sent"));
    }

    // Sync CRM deal stage (best-effort)
    if (p.clientEmail) {
      try {
        const { updateDealStageForEmail } = await import("@/lib/integrations/hubspot");
        await updateDealStageForEmail(p.clientEmail, ["Proposal Sent", "Qualification", "Proposal Generated"]);
      } catch (e) {
        console.warn("CRM stage sync on send failed:", e);
      }
    }

    await recordEvent(proposalId, "sent", { emailed: Boolean(p.clientEmail) });
    try { await emitEvent("proposal_sent", { proposalId, clientId: p.clientId || undefined, metadata: { title: p.title, value: p.total } }); } catch {}

    return Response.json({
      success: true,
      emailed: Boolean(p.clientEmail),
      emailStatus: emailResult?.webhook || "queued",
      note: "Follow-up sequence scheduled (day 2 / day 5 / day 10).",
    });
  } catch (e) {
    console.error("Send proposal error:", e);
    return Response.json({ error: "Failed to send proposal" }, { status: 500 });
  }
}

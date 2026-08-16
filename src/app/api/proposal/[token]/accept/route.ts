import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordClientDecision } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposal/[token]/accept — client accepts (records signature)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { token } = await params;
    const p = await getProposalByToken(token);
    if (!p) return Response.json({ error: "Proposal not found" }, { status: 404 });
    if (p.status && ["accepted", "rejected", "expired", "archived"].includes(p.status)) {
      return Response.json({ error: `This proposal has already been ${p.status}.` }, { status: 409 });
    }

    const body = await request.json();
    const name = body.name?.toString().trim();
    if (!name) return Response.json({ error: "Please enter your name to accept." }, { status: 400 });

    await recordClientDecision({
      proposalId: p.id,
      decision: "accepted",
      clientName: name,
      clientEmail: body.email || p.clientEmail || undefined,
      comments: body.comments || undefined,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
    });

    // Best-effort CRM stage
    try {
      const email = body.email || p.clientEmail;
      if (email) {
        const { updateDealStageForEmail } = await import("@/lib/integrations/hubspot");
        await updateDealStageForEmail(email, ["Proposal Accepted", "Contract Sent"]);
      }
    } catch (e) {
      console.warn("CRM sync on accept failed:", e);
    }

    return Response.json({ success: true, message: "Thank you — the proposal has been accepted." });
  } catch (e) {
    console.error("Accept proposal error:", e);
    return Response.json({ error: "Failed to record acceptance" }, { status: 500 });
  }
}

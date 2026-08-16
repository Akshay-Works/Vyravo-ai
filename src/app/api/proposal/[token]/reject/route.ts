import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordClientDecision } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposal/[token]/reject — client declines with optional reason
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
    await recordClientDecision({
      proposalId: p.id,
      decision: "rejected",
      clientName: body.name || p.clientName || undefined,
      clientEmail: body.email || p.clientEmail || undefined,
      comments: body.reason || body.comments || undefined,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
    });

    return Response.json({ success: true });
  } catch (e) {
    console.error("Reject proposal error:", e);
    return Response.json({ error: "Failed to record decision" }, { status: 500 });
  }
}

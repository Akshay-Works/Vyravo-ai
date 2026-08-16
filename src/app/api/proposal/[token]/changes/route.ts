import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordClientDecision, addComment } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposal/[token]/changes — client requests changes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { token } = await params;
    const p = await getProposalByToken(token);
    if (!p) return Response.json({ error: "Proposal not found" }, { status: 404 });

    const body = await request.json();
    const comments = body.comments?.toString().trim();
    if (!comments) return Response.json({ error: "Please describe the changes you'd like." }, { status: 400 });

    await recordClientDecision({
      proposalId: p.id,
      decision: "changes_requested",
      clientName: body.name || p.clientName || undefined,
      clientEmail: body.email || p.clientEmail || undefined,
      comments,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
    });

    return Response.json({ success: true });
  } catch (e) {
    console.error("Request changes error:", e);
    return Response.json({ error: "Failed to record request" }, { status: 500 });
  }
}

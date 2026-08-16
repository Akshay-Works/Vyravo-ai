import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordEvent } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// GET /api/proposal/[token] — secure public proposal view (no admin auth)
// Returns only client-safe fields; internal fields are stripped.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  { const rl = rateLimit("search", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { token } = await params;
    const p = await getProposalByToken(token);
    if (!p) return Response.json({ error: "Proposal not found or has expired." }, { status: 404 });
    if (p.status === "archived") return Response.json({ error: "This proposal is no longer available." }, { status: 410 });

    const content = (p.proposalContent as any) || null;

    // Record view (first view sets viewedAt + status)
    await recordEvent(p.id, "opened", {}, { ip: clientIp(request), userAgent: request.headers.get("user-agent") || undefined });
    if (p.status === "sent") {
      await (await import("@/lib/proposals/engine")).setProposalStatus(p.id, "viewed");
    }

    return Response.json({
      proposal: {
        id: p.id,
        title: p.title,
        number: p.number,
        status: p.status,
        clientName: p.clientName,
        companyName: p.companyName,
        industry: p.industry,
        currency: p.currency,
        total: p.total,
        subtotal: p.subtotal,
        discount: p.discount,
        tax: p.tax,
        expiresAt: p.expiresAt,
        signedBy: p.signedBy,
        signedAt: p.signedAt,
        content,
      },
    });
  } catch (e) {
    console.error("Public proposal view error:", e);
    return Response.json({ error: "Failed to load proposal" }, { status: 500 });
  }
}

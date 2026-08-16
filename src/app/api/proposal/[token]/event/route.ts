import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordEvent } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposal/[token]/event — client-side tracking (viewed, section_viewed, downloaded)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  { const rl = rateLimit("search", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { token } = await params;
    const p = await getProposalByToken(token);
    if (!p) return Response.json({ error: "Proposal not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const eventType = (body.eventType || "viewed").toString().slice(0, 50);
    await recordEvent(p.id, eventType, body.metadata || {}, {
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
    });

    if (eventType === "viewed" && p.status === "sent") {
      const { setProposalStatus } = await import("@/lib/proposals/engine");
      await setProposalStatus(p.id, "viewed");
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error("Proposal event error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

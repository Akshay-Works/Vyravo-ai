import { NextRequest } from "next/server";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposalByToken, recordEvent } from "@/lib/proposals/engine";
import { renderProposalPdf } from "@/lib/proposals/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/proposal/[token]/pdf — secure public PDF download
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  { const rl = rateLimit("search", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { token } = await params;
    const p = await getProposalByToken(token);
    if (!p) return Response.json({ error: "Proposal not found" }, { status: 404 });

    const content = (p.proposalContent as any) || { sections: [], services: [], pricing: {}, milestones: [] };
    const buffer = await renderProposalPdf(p, content);
    await recordEvent(p.id, "downloaded", {}, { ip: clientIp(request), userAgent: request.headers.get("user-agent") || undefined });

    const safe = (p.title || "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vyravo-ai-${safe}.pdf"`,
      },
    });
  } catch (e) {
    console.error("Public PDF generation error:", e);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }
}

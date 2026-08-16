import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getProposal, recordEvent } from "@/lib/proposals/engine";
import { renderProposalPdf } from "@/lib/proposals/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/proposals/[id]/pdf — download proposal PDF
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const proposalId = Number(id);
    const data = await getProposal(proposalId);
    if (!data) return Response.json({ error: "Proposal not found" }, { status: 404 });
    const { proposal } = data;
    const content = (proposal.proposalContent as any) || { sections: [], services: [], pricing: {}, milestones: [] };

    const buffer = await renderProposalPdf(proposal, content);
    await recordEvent(proposalId, "downloaded", { by: "admin" });

    const safe = (proposal.title || "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vyravo-ai-${safe}.pdf"`,
      },
    });
  } catch (e) {
    console.error("PDF generation error:", e);
    return Response.json({ error: "PDF generation failed" }, { status: 500 });
  }
}

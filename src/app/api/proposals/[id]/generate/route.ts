import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposal, updateProposal, recordEvent } from "@/lib/proposals/engine";
import { generateProposalContent } from "@/lib/proposals/ai-generator";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/generate — AI-generate proposal content from KB
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("ask", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    const proposalId = Number(id);
    const data = await getProposal(proposalId);
    if (!data) return Response.json({ error: "Proposal not found" }, { status: 404 });
    const p = data.proposal;

    const body = await request.json().catch(() => ({}));
    const services: string[] = Array.isArray(body.services) && body.services.length
      ? body.services
      : ((p.selectedServices as any[]) || []).map((s) => s.name || s);

    // Mark generating
    await pool.query(
      `UPDATE proposals SET ai_status = 'generating', updated_at = now() WHERE id = $1`,
      [proposalId]
    );

    const result = await generateProposalContent({
      title: p.title,
      clientName: p.clientName || undefined,
      companyName: p.companyName || undefined,
      industry: p.industry || undefined,
      projectDescription: p.projectDescription || undefined,
      businessProblems: p.businessProblems || undefined,
      goals: p.goals || undefined,
      requirements: p.requirements || undefined,
      services,
      expiryDays: p.expiryDays || 14,
      currency: p.currency || "USD",
      customNotes: p.notes || undefined,
    });

    // Merge generated sections into the existing content (preserve pricing/milestones)
    const existing = (p.proposalContent as any) || { sections: [], services: [], pricing: null, milestones: [] };
    const generatedSections = result.content.sections.filter(
      (s) => !["cover", "investment", "terms", "acceptance", "contact"].includes(s.id)
    );
    const keptSections = (existing.sections || []).filter((s: any) =>
      ["cover", "investment", "terms", "acceptance", "contact"].includes(s.id)
    );
    const content = {
      ...result.content,
      sections: [...keptSections, ...generatedSections],
      pricing: existing.pricing || result.content.pricing,
      milestones: existing.milestones || result.content.milestones,
    };

    // Save generated content — stays in draft (human approval required)
    await updateProposal(proposalId, { content: content as any }, "AI-generated content (draft)");
    await pool.query(
      `UPDATE proposals SET ai_status = 'generated', generated_by_ai = true, updated_at = now() WHERE id = $1`,
      [proposalId]
    );
    await recordEvent(proposalId, "ai_generated", { usedLlm: result.usedLlm, warnings: result.warnings });

    return Response.json({
      success: true,
      content,
      usedLlm: result.usedLlm,
      warnings: result.warnings,
      note: "AI-generated proposals require human review and approval before sending.",
    });
  } catch (e) {
    console.error("Generate proposal error:", e);
    try {
      const { id } = await params;
      await pool.query(`UPDATE proposals SET ai_status = 'failed' WHERE id = $1`, [Number(id)]);
    } catch {}
    return Response.json({ error: "Proposal generation failed" }, { status: 500 });
  }
}

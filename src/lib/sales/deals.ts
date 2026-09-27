// ============================================================================
// SALES OS — proposals + pipeline sync (§14). Generation reuses the existing
// KB-grounded AI generator (placeholders, never invented pricing) and always
// lands in DRAFT for founder approval (L2). syncProposalStages keeps sales
// stages truthful from proposal outcomes.
// ============================================================================
import { pool } from "@/db";
import { createProposal, recordEvent } from "@/lib/proposals/engine";
import { generateProposalContent } from "@/lib/proposals/ai-generator";
import { logDecision, createEscalation } from "./schema";
import { advanceStage } from "./stages";

export async function generateSalesProposal(leadId: number, opts: {
  requirements?: string[]; services?: string[]; goals?: string[]; notes?: string;
} = {}): Promise<{ proposalId: number; warnings: string[] }> {
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) throw new Error("lead not found");
  const problems = [lead.biggest_challenge].filter((x) => x && String(x).trim()).map((x) => String(x).slice(0, 300));
  const services = (opts.services && opts.services.length ? opts.services
    : String(lead.recommended_services || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4));
  const gen = await generateProposalContent({
    title: `Proposal — ${lead.business_name || lead.full_name || "Client"}`,
    clientName: lead.full_name || undefined,
    companyName: lead.business_name || undefined,
    industry: lead.industry || undefined,
    projectDescription: lead.automation_goals || lead.desired_outcome || undefined,
    businessProblems: problems.length ? problems : undefined,
    goals: opts.goals || (lead.desired_outcome ? [String(lead.desired_outcome).slice(0, 300)] : undefined),
    requirements: opts.requirements?.length ? opts.requirements : undefined,
    services: services.length ? services : ["AI automation"],
    currency: "INR",
    customNotes: opts.notes,
  });
  const proposalId = await createProposal({
    title: `Proposal — ${lead.business_name || lead.full_name || "Client"}`,
    clientName: lead.full_name || undefined,
    companyName: lead.business_name || undefined,
    clientEmail: lead.email || undefined,
    clientPhone: lead.phone || undefined,
    clientWebsite: lead.business_website || undefined,
    industry: lead.industry || undefined,
    leadId,
    projectDescription: lead.automation_goals || lead.desired_outcome || undefined,
    businessProblems: problems.length ? problems : undefined,
    requirements: opts.requirements?.length ? opts.requirements : undefined,
    content: gen.content,
    notes: [opts.notes, gen.warnings.length ? `AI warnings: ${gen.warnings.join("; ")}` : ""].filter(Boolean).join("\n") || undefined,
  });
  await pool.query(`UPDATE proposals SET generated_by_ai = true, ai_status = 'draft_ready' WHERE id = $1`, [proposalId]);
  await recordEvent(proposalId, "ai_generated" as any, { warnings: gen.warnings }).catch(() => {});
  await logDecision({ lead_id: leadId, trigger_text: "generateSalesProposal", action: "proposal_drafted",
    autonomy: "L2", reason: `proposal #${proposalId} drafted, awaiting approval`, context: { proposalId, warnings: gen.warnings }, result: "drafted" });
  await createEscalation({ lead_id: leadId, kind: "proposal_approval",
    title: `Proposal #${proposalId} ready for approval`,
    detail: `Draft generated from CRM context. Warnings: ${gen.warnings.join("; ") || "none"}. Pricing uses KB-approved figures or placeholders — verify before sending.`,
    recommendation: "Review, adjust pricing/scope, approve in Proposals." });
  return { proposalId, warnings: gen.warnings };
}

/** Proposal outcomes → sales stages. Idempotent (same-stage moves are no-ops). */
export async function syncProposalStages(): Promise<{ synced: number }> {
  let synced = 0;
  const rows = await pool.query(
    `SELECT p.id, p.lead_id, p.status, l.stage FROM proposals p
     JOIN leads l ON l.id = p.lead_id
     WHERE p.lead_id IS NOT NULL AND p.status IN ('sent','viewed','changes_requested','accepted','rejected','expired')`);
  for (const r of rows.rows as any[]) {
    const to = r.status === "sent" || r.status === "viewed" ? "proposal_sent"
      : r.status === "changes_requested" ? "negotiation"
      : r.status === "accepted" ? "won"
      : r.status === "rejected" ? "lost" : "nurture";
    try {
      const moved = await advanceStage(Number(r.lead_id), to, `proposal #${r.id} → ${r.status}`, { trigger: "syncProposalStages" });
      if (moved.moved) {
        synced++;
        if (to === "won")
          await createEscalation({ lead_id: Number(r.lead_id), kind: "deal_won",
            title: `Deal WON (proposal #${r.id}) — start onboarding`,
            detail: "Proposal accepted. Convert to client and trigger onboarding.",
            recommendation: "Create client record + kick off onboarding." }).catch(() => {});
      }
    } catch {}
  }
  return { synced };
}

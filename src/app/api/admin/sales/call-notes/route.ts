import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { advanceStage } from "@/lib/sales/stages";
import { generateSalesProposal } from "@/lib/sales/deals";
import { logDecision } from "@/lib/sales/schema";
import { getOpenAIClient, isOpenAIConfigured, getChatModel, modelSupportsTemperature } from "@/lib/openai/client";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/call-notes — { lead_id, meeting_id?, notes }
// Saves notes → summarizes (LLM) → updates CRM → stages discovery_completed
// → drafts proposal (L2 approval) → returns follow-up email + tasks.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const leadId = Number(b.lead_id);
  const meetingId = Number(b.meeting_id) || null;
  const notes = String(b.notes || "");
  if (!leadId || notes.trim().length < 50)
    return Response.json({ error: "lead_id + notes (50+ chars) required" }, { status: 400 });
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) return Response.json({ error: "lead not found" }, { status: 404 });

  if (meetingId)
    await pool.query(`UPDATE meetings SET notes = $2, updated_at = now() WHERE id = $1`, [meetingId, notes.slice(0, 8000)]);

  if (!isOpenAIConfigured())
    return Response.json({ ok: false, saved: true, error: "notes saved, but AI summarizer unavailable (no OPENAI_API_KEY)" });

  let parsed: any = null;
  try {
    const model = getChatModel();
    const res = await getOpenAIClient().chat.completions.create({
      model,
      ...(modelSupportsTemperature(model) ? { temperature: 0.3 } : {}),
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You are a sales assistant for Vyravo AI (AI automation: receptionists, follow-ups, lead handling, WhatsApp automation, reporting). From discovery-call notes extract ONLY stated facts — never invent budget, timeline, or requirements. Respond ONLY with JSON: {"summary","requirements":[],"budget":null|string,"timeline":null|string,"objections":[],"services":[],"followup_email":{"subject","body"},"tasks":[]}. services: pick ONLY from [AI receptionist, Automated follow-ups, Lead handling, WhatsApp automation, Review automation, Reporting, Custom AI solution]. followup_email: short thank-you + agreed next step, no banned phrases.` },
        { role: "user", content: `LEAD: ${lead.business_name || lead.full_name} (${lead.industry || "?"})\nNOTES:\n${notes}`.slice(0, 6000) },
      ],
    });
    parsed = JSON.parse(res.choices?.[0]?.message?.content || "{}");
  } catch (e: any) {
    return Response.json({ ok: false, saved: true, error: `notes saved, summarizer failed: ${String(e?.message || e).slice(0, 160)}` });
  }
  const reqs: string[] = Array.isArray(parsed.requirements) ? parsed.requirements.filter((x: any) => typeof x === "string").slice(0, 12) : [];
  const tasks: string[] = Array.isArray(parsed.tasks) ? parsed.tasks.filter((x: any) => typeof x === "string").slice(0, 10) : [];

  if (!lead.budget_range && typeof parsed.budget === "string" && parsed.budget.trim())
    await pool.query(`UPDATE leads SET budget_range = $2 WHERE id = $1`, [leadId, parsed.budget.slice(0, 120)]);
  if (!lead.timeline && typeof parsed.timeline === "string" && parsed.timeline.trim())
    await pool.query(`UPDATE leads SET timeline = $2 WHERE id = $1`, [leadId, parsed.timeline.slice(0, 120)]);
  if (meetingId)
    await pool.query(`UPDATE meetings SET summary = $2, action_items = $3, status = 'completed', updated_at = now() WHERE id = $1`,
      [meetingId, String(parsed.summary || "").slice(0, 2000), JSON.stringify(tasks)]);
  await advanceStage(leadId, "discovery_completed", "call notes processed", { actor: "admin", trigger: "call-notes" });
  await pool.query(`INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','call_logged',$2,$1,now())`,
    [leadId, `Discovery notes logged (${notes.length} chars) — summary + proposal drafted`]).catch(() => {});
  await logDecision({ lead_id: leadId, trigger_text: "call-notes", to_stage: "discovery_completed",
    action: "call_processed", autonomy: "L2", reason: "founder notes → summary + CRM + proposal draft",
    context: { requirements: reqs }, result: "processed" });

  let proposal: any = null;
  try {
    proposal = await generateSalesProposal(leadId, { requirements: reqs, services: Array.isArray(parsed.services) ? parsed.services.slice(0, 4) : undefined });
  } catch (e: any) {
    console.error("auto proposal draft failed:", e);
  }
  // L2 outbox: hold the follow-up email for founder approval (never auto-send).
  let heldEmailId: number | null = null;
  const fu = parsed.followup_email && typeof parsed.followup_email === "object" ? parsed.followup_email : null;
  if (fu && typeof fu.body === "string" && fu.body.trim().length >= 20 && lead.email) {
    const html = `<div>${fu.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").split(/\n{2,}|\r?\n\r?\n/).map((p: string) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`).join("")}</div>`;
    const ins = await pool.query(
      `INSERT INTO email_queue (lead_id, email_type, scheduled_for, status, template_data, created_at)
       VALUES ($1,'followup_l2', now(), 'held', $2, now()) RETURNING id`,
      [leadId, JSON.stringify({ to: lead.email, subject: String(fu.subject || "Following up").slice(0, 200), html, leadId })]);
    heldEmailId = Number(ins.rows[0].id);
    const { createEscalation } = await import("@/lib/sales/schema");
    await createEscalation({ lead_id: leadId, kind: "email_approval",
      title: `Follow-up email needs approval (outbox #${heldEmailId})`,
      detail: `Post-call follow-up drafted. Subject: "${String(fu.subject || "").slice(0, 100)}"`,
      recommendation: "Review in Sales → Outbox, then approve or discard." });
  }
  return Response.json({ ok: true, summary: parsed.summary || "", requirements: reqs,
    objections: parsed.objections || [], proposalId: proposal?.proposalId || null,
    proposalWarnings: proposal?.warnings || [], followup_email: parsed.followup_email || null,
    heldEmailId, tasks });
}

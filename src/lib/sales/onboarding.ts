// ============================================================================
// SALES OS — post-payment onboarding. Triggered automatically on DEAL_WON:
// welcome email (transactional — never gated by the sales pause), internal
// checklist escalation, kickoff next-action. Completion (manual confirm or
// checklist done) moves the client to active_client.
// ============================================================================
import { pool } from "@/db";
import { ensureSalesSchema, logDecision, createEscalation } from "./schema";

export async function startOnboarding(leadId: number): Promise<void> {
  await ensureSalesSchema();
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) throw new Error("lead not found");

  const { emitSalesEvent } = await import("./lifecycle");
  await emitSalesEvent({ key: `onboarding-start-${leadId}`, type: "ONBOARDING_STARTED", leadId, payload: {} });

  // 1. Welcome email (transactional — always allowed).
  if (lead.email) {
    try {
      const { sendEmail } = await import("@/lib/email/send");
      const name = lead.full_name || lead.business_name || "there";
      const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 300);
      await sendEmail({
        to: String(lead.email),
        subject: `Welcome aboard, ${String(lead.business_name || name).slice(0, 60)} — let's get started`,
        html: `<p>Hi ${esc(name)},</p><p>Your payment is confirmed — welcome to Vyravo! Here's what happens next:</p><ol><li>You'll receive a short onboarding questionnaire.</li><li>We set up your workspace and implementation checklist.</li><li>We schedule your kickoff call.</li></ol><p>Reply to this email any time — a human reads everything.</p><p>— Team Vyravo</p>`,
      });
      await logDecision({ lead_id: leadId, trigger_text: "onboarding", action: "welcome_sent", autonomy: "L1", reason: `welcome email sent to ${lead.email}`, result: "sent" });
    } catch (e: any) {
      await createEscalation({
        lead_id: leadId, kind: "onboarding_email_failed",
        title: "⚠️ Onboarding welcome email failed",
        detail: String(e?.message || e).slice(0, 500),
        recommendation: "Send the welcome email manually, then resolve.",
      });
    }
  }

  // 2. Internal implementation checklist (founder-visible task list).
  await createEscalation({
    lead_id: leadId, kind: "onboarding_checklist",
    title: `✅ Onboarding checklist — ${lead.business_name || lead.email || `lead ${leadId}`}`,
    detail: `Client paid. Complete: (1) send questionnaire, (2) create workspace, (3) implementation checklist, (4) schedule kickoff.`,
    recommendation: "Work the checklist, then mark onboarding complete (Sales → override or resolve with note).",
  });
  await pool.query(`UPDATE leads SET next_action = 'Onboarding in progress — questionnaire + kickoff', next_action_date = now() + interval '7 days' WHERE id = $1`, [leadId]).catch(() => {});
}

export async function completeOnboarding(leadId: number, actor = "admin", reason = "onboarding completed"): Promise<void> {
  await ensureSalesSchema();
  const { emitSalesEvent } = await import("./lifecycle");
  await emitSalesEvent({ key: `onboarding-done-${leadId}-${Date.now()}`, type: "ONBOARDING_COMPLETED", leadId, payload: { reason, actor } });
  await pool.query(`UPDATE sales_escalations SET status = 'resolved', resolved_at = now(), resolved_by = $2
     WHERE lead_id = $1 AND kind = 'onboarding_checklist' AND status = 'open'`, [leadId, actor]).catch(() => {});
}

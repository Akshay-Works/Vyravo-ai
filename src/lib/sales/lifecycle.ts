// ============================================================================
// SALES OS — centralized lifecycle engine. ALL stage changes flow through
// emitSalesEvent: Event → dedupe → transition → automation → log. Every event
// carries an idempotency key; processing the same event twice is a no-op.
// Sales STAGE (commercial state) is separate from the activity TIMELINE
// (communication log) — see /api/admin/crm/leads/[id]/timeline.
// ============================================================================
import { pool } from "@/db";
import { ensureSalesSchema, logDecision, createEscalation, addSuppression } from "./schema";
import { advanceStage, normalizeStage } from "./stages";

export const LIFECYCLE_EVENTS = [
  "LEAD_CREATED", "LEAD_RESEARCHED", "OUTREACH_SENT", "EMAIL_RECEIVED",
  "REPLY_CLASSIFIED", "REPLY_SENT", "LEAD_QUALIFIED", "MEETING_BOOKED",
  "MEETING_COMPLETED", "PROPOSAL_CREATED", "PROPOSAL_SENT", "NEGOTIATION_STARTED",
  "AGREEMENT_DETECTED", "INVOICE_SENT", "PAYMENT_PENDING", "PAYMENT_RECEIVED",
  "ONBOARDING_STARTED", "ONBOARDING_COMPLETED", "DEAL_WON", "DEAL_LOST",
  "UNSUBSCRIBED",
] as const;

const NEXT_ACTION: Record<string, { action: string; days: number | null }> = {
  new: { action: "AI enriching + researching company", days: 1 },
  researched: { action: "AI preparing first outreach", days: 1 },
  contacted: { action: "AI waiting for reply / follow-up sequence running", days: 3 },
  replied: { action: "AI classifying reply + drafting response", days: 1 },
  replied_to: { action: "AI waiting for prospect's next response", days: 3 },
  qualified: { action: "AI proposing meeting / sending calendar link", days: 2 },
  meeting_booked: { action: "Meeting prep brief ready — waiting for meeting", days: 7 },
  discovery_completed: { action: "AI drafting proposal for founder approval", days: 3 },
  proposal_sent: { action: "AI waiting for prospect decision", days: 5 },
  negotiation: { action: "Founder input needed — see escalation", days: 2 },
  verbal_agreement: { action: "Founder to approve — invoice next", days: 1 },
  invoice_sent: { action: "Monitoring invoice delivery", days: 2 },
  payment_pending: { action: "Monitoring payment status via provider", days: 7 },
  won: { action: "Triggering onboarding", days: 1 },
  onboarding: { action: "Onboarding in progress", days: 7 },
  active_client: { action: "None — active client", days: null },
  nurture: { action: "Nurture — scheduled re-engagement", days: 30 },
  not_interested: { action: "None — closed (not interested)", days: null },
  unqualified: { action: "None — closed (unqualified)", days: null },
  wrong_contact: { action: "None — closed (wrong contact)", days: null },
  unsubscribed: { action: "None — closed (unsubscribed)", days: null },
  lost: { action: "None — closed (lost)", days: null },
  no_response: { action: "None — closed (no response)", days: null },
};

async function setNextAction(leadId: number, stage: string): Promise<void> {
  const na = NEXT_ACTION[stage];
  if (!na) return;
  try {
    await pool.query(
      `UPDATE leads SET next_action = $2, next_action_date = ${na.days === null ? "NULL" : "now() + ($3 || ' days')::interval"} WHERE id = $1`,
      na.days === null ? [leadId, na.action] : [leadId, na.action, String(na.days)]);
  } catch { /* columns may predate migration — non-fatal */ }
}

async function stopSalesAutomation(leadId: number): Promise<void> {
  await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued','sending')`, [leadId]);
  await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [leadId]).catch(() => {});
  try {
    const { pauseChannels } = await import("./orchestrate");
    await pauseChannels(leadId, "lifecycle stop");
  } catch { /* non-fatal */ }
}

export interface LifecycleEvent {
  key: string;
  type: string;
  leadId: number | null;
  payload?: Record<string, any>;
}

export async function emitSalesEvent(e: LifecycleEvent): Promise<{ duplicate: boolean; result: string }> {
  await ensureSalesSchema();
  const key = String(e.key || "").slice(0, 200);
  if (!key) throw new Error("lifecycle event requires a key");
  const type = String(e.type || "").toUpperCase();
  const leadId = e.leadId ?? null;
  const payload = e.payload || {};

  const ins = await pool.query(
    `INSERT INTO sales_events (event_key, event_type, lead_id, payload) VALUES ($1,$2,$3,$4)
     ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [key, type, leadId, JSON.stringify(payload).slice(0, 4000)]);
  if ((ins.rowCount ?? 0) === 0) return { duplicate: true, result: "duplicate ignored" };
  const eventId = Number(ins.rows[0].id);

  let result = "no-op";
  try {
    result = await route(type, leadId, payload);
    await pool.query(`UPDATE sales_events SET processed_at = now(), result = $2 WHERE id = $1`, [eventId, result.slice(0, 300)]);
  } catch (err: any) {
    result = `error: ${String(err?.message || err).slice(0, 200)}`;
    await pool.query(`UPDATE sales_events SET processed_at = now(), result = $2 WHERE id = $1`, [eventId, result]);
  }
  return { duplicate: false, result };
}

async function currentStage(leadId: number): Promise<string> {
  const r = await pool.query(`SELECT stage FROM leads WHERE id = $1`, [leadId]);
  return normalizeStage(r.rows[0]?.stage);
}

async function route(type: string, leadId: number | null, p: Record<string, any>): Promise<string> {
  if (!leadId) return "no lead — logged only";
  switch (type) {
    case "LEAD_CREATED": {
      await setNextAction(leadId, "new");
      return "staged new; enrichment queued";
    }
    case "LEAD_RESEARCHED": {
      const r = await advanceStage(leadId, "researched", "enrichment + research completed", { trigger: "LEAD_RESEARCHED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to researched" : `no move (${r.from})`;
    }
    case "OUTREACH_SENT": {
      const r = await advanceStage(leadId, "contacted", `first outreach sent via ${p.channel || "email"}`, { trigger: "OUTREACH_SENT" });
      await pool.query(
        `UPDATE leads SET first_contacted_at = COALESCE(first_contacted_at, now()),
          first_contact_channel = COALESCE(first_contact_channel, $2),
          first_contact_message_id = COALESCE(first_contact_message_id, $3) WHERE id = $1`,
        [leadId, String(p.channel || "email").slice(0, 40), String(p.messageId || "").slice(0, 255) || null]).catch(() => {});
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to contacted" : `already ${r.from}`;
    }
    case "EMAIL_RECEIVED": {
      // Conversation loop: contacted → replied, replied_to → replied (back-edge).
      const r = await advanceStage(leadId, "replied", "prospect reply detected", { trigger: "EMAIL_RECEIVED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to replied" : `already ${r.from}`;
    }
    case "REPLY_CLASSIFIED": {
      const { decideForInbox } = await import("./decide");
      const next = await decideForInbox({
        lead_id: leadId,
        classification: p.classification || "general",
        confidence: Number(p.confidence || 0),
        actionTaken: p.actionTaken || "draft",
      });
      await setNextAction(leadId, await currentStage(leadId));
      return `classified ${p.classification} → ${next.action}`;
    }
    case "REPLY_SENT": {
      const r = await advanceStage(leadId, "replied_to", "Vyravo response sent — awaiting prospect", { trigger: "REPLY_SENT" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to replied_to" : `already ${r.from}`;
    }
    case "LEAD_QUALIFIED": {
      const r = await advanceStage(leadId, "qualified", String(p.reason || "qualification signals met"), { trigger: "LEAD_QUALIFIED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to qualified" : `already ${r.from}`;
    }
    case "MEETING_BOOKED": {
      const r = await advanceStage(leadId, "meeting_booked", String(p.reason || "meeting booked"), { trigger: "MEETING_BOOKED" });
      await stopSalesAutomation(leadId);
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to meeting_booked" : `already ${r.from}`;
    }
    case "MEETING_COMPLETED": {
      const r = await advanceStage(leadId, "discovery_completed", String(p.reason || "discovery meeting completed"), { trigger: "MEETING_COMPLETED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to discovery_completed" : `already ${r.from}`;
    }
    case "PROPOSAL_CREATED":
      return "proposal drafted — awaiting founder approval (no stage move)";
    case "PROPOSAL_SENT": {
      const r = await advanceStage(leadId, "proposal_sent", `proposal #${p.proposalId || "?"} sent`, { trigger: "PROPOSAL_SENT" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to proposal_sent" : `already ${r.from}`;
    }
    case "NEGOTIATION_STARTED": {
      const r = await advanceStage(leadId, "negotiation", String(p.summary || "objection / scope change detected").slice(0, 200), { trigger: "NEGOTIATION_STARTED" });
      await createEscalation({
        lead_id: leadId, kind: "negotiation",
        title: "💰 Prospect negotiating — founder input needed",
        detail: String(p.summary || "Pricing/scope objection detected.").slice(0, 1000),
        recommendation: String(p.suggestion || "Review the objection summary and approve a response.").slice(0, 500),
      });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to negotiation" : `already ${r.from}`;
    }
    case "AGREEMENT_DETECTED": {
      const conf = Number(p.confidence || 0);
      if (conf < 0.85) {
        await createEscalation({
          lead_id: leadId, kind: "agreement_uncertain",
          title: "Possible verbal agreement — confirm before invoicing",
          detail: String(p.evidence || "").slice(0, 1000),
          recommendation: "Confirm the prospect truly agreed; vague positivity must not trigger an invoice.",
        });
        return "low-confidence agreement → escalated, no move";
      }
      const r = await advanceStage(leadId, "verbal_agreement", `explicit agreement (${conf.toFixed(2)})`, { trigger: "AGREEMENT_DETECTED" });
      // Auto-invoice fast path: standard packages under the founder's cap skip the wait.
      try {
        const capRow = await pool.query(`SELECT v FROM outreach_config WHERE k = 'auto_invoice_max'`);
        const cap = Number(capRow.rows[0]?.v || 0);
        let amount = Number(p.amount || 0);
        if (!amount && p.evidence) {
          const { extractRequestedPrice } = await import("./negotiate");
          amount = extractRequestedPrice(String(p.evidence))?.amount || 0;
        }
        if (!amount) {
          const prop = await pool.query(`SELECT total FROM proposals WHERE lead_id = $1 AND status NOT IN ('draft','rejected','expired','archived') ORDER BY id DESC LIMIT 1`, [leadId]);
          amount = Number(prop.rows[0]?.total || 0);
        }
        if (cap > 0 && amount > 0 && amount <= cap) {
          const { createInvoice, sendInvoice } = await import("./invoices");
          const inv = await createInvoice(leadId, { amount, currency: String(p.currency || "INR"), quiet: true });
          await sendInvoice(inv.id, "auto");
          await logDecision({ lead_id: leadId, trigger_text: "AGREEMENT_DETECTED", action: "auto_invoiced",
            autonomy: "L1", reason: `agreement ${amount} ≤ cap ${cap} — invoiced without wait`, context: { invoiceId: inv.id }, result: "invoiced" });
          await setNextAction(leadId, await currentStage(leadId));
          return `verbal_agreement + auto-invoiced ${amount} (under cap ${cap})`;
        }
      } catch { /* auto-invoice failure: fall through to manual approval */ }
      await createEscalation({
        lead_id: leadId, kind: "deal_won",
        title: "🔥 Prospect wants to proceed — approve invoice",
        detail: String(p.evidence || "").slice(0, 1000),
        recommendation: "Review agreed scope/price and approve invoice creation.",
      });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to verbal_agreement" : `already ${r.from}`;
    }
    case "INVOICE_SENT": {
      const r = await advanceStage(leadId, "invoice_sent", `invoice ${p.invoiceNo || ""} sent`.trim(), { trigger: "INVOICE_SENT" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to invoice_sent" : `already ${r.from}`;
    }
    case "PAYMENT_PENDING": {
      const r = await advanceStage(leadId, "payment_pending", "invoice delivered — monitoring payment", { trigger: "PAYMENT_PENDING" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to payment_pending" : `already ${r.from}`;
    }
    case "PAYMENT_RECEIVED":
    case "DEAL_WON": {
      const r = await advanceStage(leadId, "won", `payment confirmed (${p.currency || "INR"} ${p.amount ?? "?"})`, { trigger: type });
      await pool.query(`UPDATE leads SET status = 'won' WHERE id = $1`, [leadId]).catch(() => {});
      if (p.amount != null) {
        await pool.query(`UPDATE leads SET deal_value = COALESCE(deal_value, $2), deal_currency = COALESCE(deal_currency, $3) WHERE id = $1`,
          [leadId, Number(p.amount), String(p.currency || "INR").slice(0, 8)]).catch(() => {});
      }
      await stopSalesAutomation(leadId);
      await createEscalation({
        lead_id: leadId, kind: "deal_won",
        title: "💳 Payment received — deal WON",
        detail: `Invoice ${p.invoiceNo || ""} paid (${p.currency || "INR"} ${p.amount ?? "?"}). Onboarding triggered.`.slice(0, 500),
        recommendation: "None — onboarding is automatic. Review the client handoff when ready.",
      });
      try {
        const { startOnboarding } = await import("./onboarding");
        await startOnboarding(leadId);
      } catch { /* onboarding failure must not lose the win */ }
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to won + onboarding" : "already won";
    }
    case "ONBOARDING_STARTED": {
      const r = await advanceStage(leadId, "onboarding", "onboarding triggered", { trigger: "ONBOARDING_STARTED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to onboarding" : `already ${r.from}`;
    }
    case "ONBOARDING_COMPLETED": {
      const r = await advanceStage(leadId, "active_client", String(p.reason || "onboarding completed"), { trigger: "ONBOARDING_COMPLETED" });
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? "moved to active_client" : `already ${r.from}`;
    }
    case "DEAL_LOST": {
      const r = await advanceStage(leadId, String(p.to || "lost"), String(p.reason || "deal lost").slice(0, 200), { trigger: "DEAL_LOST" });
      await stopSalesAutomation(leadId);
      await setNextAction(leadId, await currentStage(leadId));
      return r.moved ? `moved to ${r.to}` : `already ${r.from}`;
    }
    case "UNSUBSCRIBED": {
      const r = await advanceStage(leadId, "unsubscribed", "prospect opted out", { trigger: "UNSUBSCRIBED" });
      await stopSalesAutomation(leadId);
      try {
        const lr = await pool.query(`SELECT email FROM leads WHERE id = $1`, [leadId]);
        if (lr.rows[0]?.email) await addSuppression(lr.rows[0].email, "unsubscribed", "lifecycle");
      } catch { /* non-fatal */ }
      await logDecision({ lead_id: leadId, trigger_text: "UNSUBSCRIBED", action: "suppressed", autonomy: "L1", reason: "added to suppression list", result: "suppressed" });
      return r.moved ? "moved to unsubscribed + suppressed" : "already terminal";
    }
    default:
      await logDecision({ lead_id: leadId, trigger_text: type, action: "unknown_event", autonomy: "none", reason: "unrouted lifecycle event — logged only", status: "blocked" });
      return `unknown event ${type} — logged only`;
  }
}

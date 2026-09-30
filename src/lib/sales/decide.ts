// ============================================================================
// SALES OS — decision engine v1 (§21). Deterministic rules over unified lead
// state: the LLM writes WORDS, it never makes pipeline DECISIONS. Every
// decision is logged (§30); founder-needed items become escalations (§22).
// ============================================================================
import { pool } from "@/db";
import { ensureSalesSchema, logDecision, createEscalation } from "./schema";
import { advanceStage } from "./stages";

export type Autonomy = "L1" | "L2" | "L3" | "none";

export interface NextAction {
  action: string;
  stage_move: string | null;
  autonomy: Autonomy;
  reason: string;
  confidence: number;
}

/**
 * Called after an inbox message is processed. Deterministic rules over the
 * canonical intent taxonomy (see classify.ts): the LLM writes WORDS, it never
 * makes pipeline DECISIONS. Every decision is logged; founder-needed items
 * become escalations. Conversation loop: replied ⇄ replied_to.
 */
export async function decideForInbox(msg: {
  lead_id: number | null; classification: string | null; confidence: number | null; actionTaken: string;
}): Promise<NextAction> {
  await ensureSalesSchema();
  const cls = String(msg.classification || "general");
  const conf = Number(msg.confidence || 0);
  const leadId = msg.lead_id;
  const done = async (a: NextAction, esc?: { kind: string; title: string; detail: string; recommendation: string }) => {
    if (leadId && a.stage_move) {
      try { await advanceStage(leadId, a.stage_move, a.reason, { trigger: `inbox:${cls}` }); } catch {}
    }
    if (leadId && esc) {
      try { await createEscalation({ lead_id: leadId, ...esc }); } catch {}
    }
    await logDecision({
      lead_id: leadId, trigger_text: `inbox:${cls} (${msg.actionTaken})`, to_stage: a.stage_move,
      action: a.action, autonomy: a.autonomy, reason: a.reason, confidence: a.confidence,
      context: { classification: cls }, result: esc ? "escalated" : "auto",
    });
    return a;
  };

  // Terminal / opt-out classes route through lifecycle events (suppression + stop).
  if (cls === "unsubscribe" && leadId) {
    try {
      const { emitSalesEvent } = await import("./lifecycle");
      await emitSalesEvent({ key: `unsub-inbox-${leadId}-${Date.now()}`, type: "UNSUBSCRIBED", leadId, payload: { via: "inbox" } });
    } catch {}
    return done({ action: "suppress", stage_move: null, autonomy: "L1", reason: "opt-out → UNSUBSCRIBED + suppression", confidence: conf });
  }
  if (cls === "not_interested") {
    if (leadId) {
      try {
        await pool.query(`UPDATE outreach_events SET status = 'cancelled' WHERE lead_id = $1 AND status IN ('queued','sending')`, [leadId]);
        await pool.query(`UPDATE email_queue SET status = 'skipped' WHERE lead_id = $1 AND status = 'pending' AND template_data->>'outreach_event_id' IS NOT NULL`, [leadId]);
      } catch {}
    }
    return done({ action: "none", stage_move: "not_interested", autonomy: "L1", reason: "prospect declined — sequence stopped", confidence: conf });
  }
  if (cls === "wrong_person" || cls === "wrong_contact")
    return done({ action: "none", stage_move: "wrong_contact", autonomy: "L1", reason: "wrong contact — terminal", confidence: conf });
  if (cls === "out_of_office") {
    if (leadId) {
      try { await pool.query(`UPDATE leads SET next_follow_up = now() + interval '7 days' WHERE id = $1`, [leadId]); } catch {}
    }
    return done({ action: "none", stage_move: null, autonomy: "L1", reason: "OOO — retry in 7 days, no stage move", confidence: conf });
  }
  if (cls === "not_now" || cls === "followup_later" || cls === "defer") {
    if (leadId) {
      try { await pool.query(`UPDATE leads SET next_follow_up = now() + interval '30 days' WHERE id = $1`, [leadId]); } catch {}
    }
    return done({ action: "none", stage_move: "nurture", autonomy: "L1", reason: "timing defer — nurture + re-engage in 30d", confidence: conf });
  }
  // Agreement detection: high-confidence only; vague positivity escalates.
  if (["agreement", "verbal_agreement", "proceed", "accepted"].includes(cls)) {
    if (conf >= 0.85 && leadId) {
      try {
        const { emitSalesEvent } = await import("./lifecycle");
        await emitSalesEvent({ key: `agree-inbox-${leadId}-${Date.now()}`, type: "AGREEMENT_DETECTED", leadId,
          payload: { confidence: conf, evidence: `inbox classification '${cls}'` } });
      } catch {}
      return done({ action: "escalate", stage_move: null, autonomy: "L2", reason: "explicit agreement → invoice approval", confidence: conf });
    }
    return done({ action: "escalate", stage_move: "replied", autonomy: "L2",
      reason: "possible agreement below confidence bar — human must confirm", confidence: conf },
      { kind: "agreement_uncertain", title: "Possible agreement — confirm before invoicing",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. Vague positivity must not trigger an invoice.`,
        recommendation: "Read the reply; confirm real agreement, then approve invoice creation." });
  }
  // Objection / negotiation talk after a proposal exists → negotiation.
  if (["objection", "negotiation", "discount_request", "scope_change"].includes(cls))
    return done({ action: "escalate", stage_move: "negotiation", autonomy: "L3",
      reason: `commercial objection ('${cls}') — founder decides`, confidence: conf },
      { kind: "negotiation", title: "💰 Prospect pushing on price/scope",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. AI reply ${msg.actionTaken === "send" ? "was sent" : "is pending review"}.`,
        recommendation: "Review the objection analysis and approve the response / revised terms." });
  if (cls === "meeting_request" && conf >= 0.75)
    return done({ action: "escalate", stage_move: "replied", autonomy: "L3",
      reason: "prospect asked for a meeting", confidence: conf },
      { kind: "meeting_request", title: "📅 Prospect wants a meeting — booking link sent",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. AI reply ${msg.actionTaken === "send" ? "was sent (with calendar link)" : "is pending review"}. Booking auto-detects via Calendly sync.`,
        recommendation: "Confirm the reply; the booking lands in Meeting Booked automatically." });
  if ((cls === "pricing_request" || cls === "pricing") && conf >= 0.5)
    return done({ action: "escalate", stage_move: "replied", autonomy: "L3",
      reason: "prospect asked for pricing — founder answers, never invented", confidence: conf },
      { kind: "pricing", title: "Pricing question needs founder answer",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. AI must not invent pricing.`,
        recommendation: "Answer pricing personally or approve a proposal with real figures." });
  if (["positive_interest", "positive", "interested", "question", "referral", "introduction", "interested_followup", "neutral"].includes(cls))
    return done({ action: "none", stage_move: "replied", autonomy: "L1",
      reason: `inbound '${cls}' handled (${msg.actionTaken}) — conversation loop`, confidence: conf });
  if (conf > 0 && conf < 0.4 && leadId)
    return done({ action: "escalate", stage_move: "replied", autonomy: "L2",
      reason: `low-confidence classification ('${cls}') — human review`, confidence: conf },
      { kind: "low_confidence", title: "⚠️ AI unsure about this reply",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}.`,
        recommendation: "Read the reply and steer the next step manually." });
  return done({ action: "none", stage_move: "replied", autonomy: "none", reason: `general inbound ('${cls}') — stays in loop`, confidence: conf });
}

/**
 * Bounded daily sweep (runs in cron after the inbox tick):
 * contacted leads whose sequence finished ≥14d ago with no reply → nurture
 * + re-engagement date +30d. Never touches replied/blocked leads.
 */
export async function salesTick(opts: { max?: number; budgetMs?: number } = {}): Promise<{
  nurtured: number; open_escalations: number; truncated: boolean; rescored: number; scoreChanged: number;
}> {
  const max = Math.min(Math.max(opts.max || 25, 1), 100);
  const t0 = Date.now();
  const budget = opts.budgetMs || 10000;
  await ensureSalesSchema();
  const cands = await pool.query(
    `SELECT l.id FROM leads l
     WHERE COALESCE(l.stage, 'new') = 'contacted'
       AND COALESCE(l.reply_received, false) = false
       AND COALESCE(l.status, 'active') NOT IN ('replied','won','lost','do_not_contact','skipped')
       AND NOT EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id AND e.status IN ('queued','sending'))
       AND EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id AND e.status = 'sent'
                   AND e.sent_at < now() - interval '14 days')
     ORDER BY l.id LIMIT $1`, [max]);
  let nurtured = 0;
  for (const row of cands.rows as any[]) {
    if (Date.now() - t0 > budget) break;
    try {
      const { emitSalesEvent } = await import("./lifecycle");
      const r = await emitSalesEvent({ key: `nurture-${row.id}`, type: "DEAL_LOST", leadId: Number(row.id),
        payload: { to: "nurture", reason: "sequence finished 14d+ ago, no reply — scheduled re-engagement" } });
      if (!r.duplicate) {
        nurtured++;
        await pool.query(`UPDATE leads SET next_follow_up = now() + interval '30 days' WHERE id = $1`, [row.id]);
        try {
          const { suggestNextChannel } = await import("./orchestrate");
          await suggestNextChannel(Number(row.id));
        } catch { /* suggestion is non-fatal */ }
      }
    } catch {}
  }
  const open = await pool.query(`SELECT count(*)::int n FROM sales_escalations WHERE status = 'open'`);
  let rescored = 0, scoreChanged = 0;
  try {
    const { rescoreTick } = await import("./score");
    const r = await rescoreTick({ max: 50 });
    rescored = r.rescored; scoreChanged = r.changed;
  } catch {}
  try {
    const { syncProposalStages } = await import("./deals");
    await syncProposalStages();
  } catch {}
  try {
    const { autoCallTaskTick } = await import("@/lib/sales-workspace/ops");
    await autoCallTaskTick(5);
  } catch { /* handoff is non-fatal */ }
  return { nurtured, open_escalations: Number(open.rows[0]?.n || 0), truncated: (cands.rowCount ?? 0) >= max, rescored, scoreChanged };
}

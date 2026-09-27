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
 * Called after an inbox message is processed. v1 rules:
 * - meeting_request (≥0.75) → engaged + L3 escalate (calendar automation: Phase 6)
 * - pricing_request (≥0.80) → engaged + L3 escalate (no approved-pricing engine yet: Phase 8)
 * - positive/question/referral/intro handled → engaged (L1, usually already moved)
 * - terminal classes → terminal stage moves (L1)
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

  if (cls === "meeting_request" && conf >= 0.75)
    return done({ action: "escalate", stage_move: "engaged", autonomy: "L3",
      reason: "prospect asked for a meeting", confidence: conf },
      { kind: "meeting_request", title: "Prospect wants a meeting — send calendar link",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. AI reply ${msg.actionTaken === "send" ? "was sent" : "is pending review"}.`,
        recommendation: "Confirm the reply, then send your Calendly link (auto-scheduling ships in Phase 6)." });
  if (cls === "pricing_request" && conf >= 0.8)
    return done({ action: "escalate", stage_move: "engaged", autonomy: "L3",
      reason: "prospect asked for pricing — no approved-pricing engine yet", confidence: conf },
      { kind: "pricing", title: "Pricing question needs founder answer",
        detail: `Classified '${cls}' at ${conf.toFixed(2)}. AI must not invent pricing.`,
        recommendation: "Answer pricing personally (approved-pricing engine ships in Phase 8)." });
  if (["positive_interest", "question", "referral", "introduction"].includes(cls))
    return done({ action: "none", stage_move: "engaged", autonomy: "L1",
      reason: `inbound '${cls}' handled (${msg.actionTaken})`, confidence: conf });
  if (cls === "not_interested")
    return done({ action: "none", stage_move: "not_interested", autonomy: "L1", reason: "prospect declined", confidence: conf });
  if (cls === "unsubscribe")
    return done({ action: "none", stage_move: null, autonomy: "L1", reason: "DNC via status (stage untouched)", confidence: conf });
  return done({ action: "none", stage_move: null, autonomy: "none", reason: `no pipeline move for '${cls}'`, confidence: conf });
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
      const r = await advanceStage(Number(row.id), "nurture", "sequence finished 14d+ ago, no reply — scheduled re-engagement", { trigger: "salesTick" });
      if (r.moved) {
        nurtured++;
        await pool.query(`UPDATE leads SET next_follow_up = now() + interval '30 days' WHERE id = $1`, [row.id]);
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
  return { nurtured, open_escalations: Number(open.rows[0]?.n || 0), truncated: (cands.rowCount ?? 0) >= max, rescored, scoreChanged };
}

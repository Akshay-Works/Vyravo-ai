// ============================================================================
// SALES OS — qualification v1 (§11 NABTFI). Deterministic extraction of
// budget/timeline/authority/intent from real conversation text. Never
// overwrites human-entered data (fills NULLs only). High-intent +
// decision-maker → qualified stage. No interrogation questionnaires.
// ============================================================================
import { pool } from "@/db";
import { logDecision } from "./schema";


export interface BuyingSignals {
  budget: string | null; timeline: string | null;
  authority: "decision_maker" | "team" | "unknown"; intent: number; // 0–3
}

/** Pure extraction — unit-tested. */
export function extractBuyingSignals(text: string): BuyingSignals {
  const t = String(text || "");
  const bm = t.match(/(₹|rs\.?|inr|\$)\s?[\d,]+(\s?(lakh|lac|k|thousand))?|budget.{0,40}?[\d,]+|[\d,]+\s?(lakh|lac)\b/i);
  const tm = t.match(/this week|next week|this month|asap|as soon as possible|urgent|this quarter|by (monday|tuesday|wednesday|thursday|friday|\w+ \d{1,2})|go.?live|start (next|this|in \w+)|timeline/i);
  const authority: BuyingSignals["authority"] =
    /(i (own|run|founded|manage|started)|i'?m the (owner|founder|ceo|director|partner)|my (clinic|hotel|restaurant|business|company|practice))/i.test(t)
      ? "decision_maker"
      : /(my (team|boss|management|board)|need to ask|check with)/i.test(t) ? "team" : "unknown";
  let intent = 0;
  if (/(price|pricing|cost|quote|proposal|charges|demo|trial|meeting|call|discuss|interested|sounds good|send (details|info|more))/i.test(t)) intent += 2;
  if (/(timeline|budget|when can (you|we) start|next steps|move (forward|ahead)|let'?s do it)/i.test(t)) intent += 1;
  return {
    budget: bm ? bm[0].slice(0, 80) : null,
    timeline: tm ? tm[0].slice(0, 80) : null,
    authority, intent: Math.min(intent, 3),
  };
}

export async function qualifyFromThread(leadId: number): Promise<BuyingSignals | null> {
  try {
    const lead = (await pool.query(`SELECT budget_range, timeline FROM leads WHERE id = $1`, [leadId])).rows[0];
    if (!lead) return null;
    const msgs = await pool.query(
      `SELECT body_text FROM inbox_messages WHERE lead_id = $1 AND direction = 'in' ORDER BY id DESC LIMIT 5`, [leadId]);
    if (!msgs.rows.length) return null;
    const sig = extractBuyingSignals(msgs.rows.map((r: any) => r.body_text || "").join("\n"));
    if (sig.budget && !lead.budget_range)
      await pool.query(`UPDATE leads SET budget_range = $2 WHERE id = $1`, [leadId, sig.budget]);
    if (sig.timeline && !lead.timeline)
      await pool.query(`UPDATE leads SET timeline = $2 WHERE id = $1`, [leadId, sig.timeline]);
    const qualified = sig.intent >= 2 || (sig.intent >= 1 && sig.authority === "decision_maker");
    await logDecision({ lead_id: leadId, trigger_text: "qualifyFromThread", action: qualified ? "qualified" : "signals",
      autonomy: "L1", reason: `intent=${sig.intent} authority=${sig.authority} budget=${sig.budget ? "yes" : "no"} timeline=${sig.timeline ? "yes" : "no"}`,
      context: sig, result: qualified ? "qualified" : "not_yet" });
    if (qualified) {
      try {
        const { emitSalesEvent } = await import("./lifecycle");
        await emitSalesEvent({ key: `qualified-${leadId}-${sig.intent}-${sig.authority}`, type: "LEAD_QUALIFIED", leadId,
          payload: { reason: `buying signals: intent ${sig.intent}/3, ${sig.authority}` } });
      } catch {}
    }
    // Negotiation watch: budget talk + open proposal = founder decision (L3).
    if (sig.budget) {
      try {
        const hasProp = Number((await pool.query(
          `SELECT count(*)::int n FROM proposals WHERE lead_id = $1 AND status NOT IN ('draft','archived','rejected','expired')`, [leadId])).rows[0].n || 0);
        if (hasProp > 0) {
          const { analyzeNegotiation } = await import("./negotiate");
          await analyzeNegotiation(leadId, msgs.rows.map((r: any) => r.body_text || "").join("\n"));
        }
      } catch {}
    }
    return sig;
  } catch {
    return null;
  }
}

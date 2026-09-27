// ============================================================================
// SALES OS — negotiation assistant (§15). Extracts the requested price,
// compares against the open proposal, recommends a response posture.
// NEVER auto-discounts: every negotiation becomes an L3 escalation.
// ============================================================================
import { pool } from "@/db";
import { logDecision, createEscalation } from "./schema";

const MONEY_RE = /(₹|rs\.?|inr|\$)\s?([\d,]+(?:\.\d+)?)(?:\s?(lakh|lac|k|thousand))?|([\d,]+(?:\.\d+)?)\s?(lakh|lac)\b/i;

export function extractRequestedPrice(text: string): { raw: string; amount: number } | null {
  const m = String(text || "").match(MONEY_RE);
  if (!m) return null;
  let amount = Number(String(m[2] || m[4] || "").replace(/,/g, ""));
  const mult = String(m[3] || m[5] || "").toLowerCase();
  if (mult.startsWith("lakh") || mult === "lac") amount *= 100000;
  else if (mult === "k" || mult === "thousand") amount *= 1000;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { raw: m[0].slice(0, 40), amount: Math.round(amount) };
}

export async function analyzeNegotiation(leadId: number, text: string): Promise<{ escalated: boolean; summary: string } | null> {
  const price = extractRequestedPrice(text);
  if (!price) return null;
  const prop = (await pool.query(
    `SELECT id, total, currency, status FROM proposals WHERE lead_id = $1 AND status NOT IN ('draft','archived','rejected','expired')
     ORDER BY id DESC LIMIT 1`, [leadId])).rows[0];
  const total = prop ? Number(prop.total || 0) : 0;
  const summary = prop && total > 0
    ? `Requested ${price.raw} vs proposal #${prop.id} total ${prop.currency || ""} ${total.toLocaleString("en-IN")}` +
      (price.amount < total
        ? ` — ${Math.round(100 * (1 - price.amount / total))}% below. Posture: hold price, offer reduced scope.`
        : price.amount >= total ? " — at/above proposal. Posture: accept in principle, confirm scope." : "")
    : `Requested ${price.raw} — no open proposal to compare. Posture: scope first, price after.`;
  await createEscalation({ lead_id: leadId, kind: "negotiation",
    title: `Negotiation: ${price.raw} requested`,
    detail: summary + ` Source: "${String(text).slice(0, 200)}"`,
    recommendation: "Founder decides. No discount was offered." });
  await logDecision({ lead_id: leadId, trigger_text: "analyzeNegotiation", action: "escalated",
    autonomy: "L3", reason: summary.slice(0, 300), context: { price }, result: "escalated" });
  return { escalated: true, summary };
}

// ============================================================================
// SALES OS — dynamic Sales Readiness Score (§4). Deterministic 0–100 from
// real signals only; recomputed on triggers + nightly sweep. Internal
// prioritization, never shown to prospects. Bands: 0–20 very low, 21–40 low,
// 41–60 moderate, 61–80 high, 81–100 immediate attention.
// ============================================================================
import { pool } from "@/db";
import { logDecision } from "./schema";

const TARGET_INDUSTRIES = ["clinic", "hospital", "dental", "ayurved", "hospitality", "hotel", "restaurant", "cafe", "real estate", "realty", "agency", "salon", "spa", "clinic", "education", "classes", "fitness", "gym"];
const FREE_MAIL = ["gmail.", "yahoo.", "hotmail.", "outlook.", "rediff", "zoho."];
const ROLE_PREFIX = ["info@", "admin@", "support@", "contact@", "hello@", "enquiry@", "enquiries@", "reservations@", "feedback@"];

export interface ScoreInput {
  industry?: string | null; country?: string | null; business_website?: string | null;
  phone?: string | null; company_size?: string | null; linkedin_url?: string | null;
  email?: string | null; full_name?: string | null; source?: string | null;
  reply_received?: boolean | null; reply_class?: string | null;
  sent_count?: number; inbox_threads?: number; last_activity_at?: string | null;
}

export function bandFor(score: number): string {
  if (score >= 81) return "immediate";
  if (score >= 61) return "high";
  if (score >= 41) return "moderate";
  if (score >= 21) return "low";
  return "very low";
}

/** Pure scoring — fully unit-testable. */
export function computeScore(l: ScoreInput): { score: number; band: string; breakdown: Record<string, number> } {
  const b: Record<string, number> = { icp: 0, contact: 0, engagement: 0, referral: 0, recency: 0 };
  // ICP fit (30)
  const ind = String(l.industry || "").toLowerCase();
  if (ind) { b.icp += 8; if (TARGET_INDUSTRIES.some((t) => ind.includes(t))) b.icp += 4; }
  if (l.country) b.icp += 4;
  if (l.business_website) b.icp += 6;
  if (l.phone) b.icp += 4;
  if (l.company_size) b.icp += 2;
  if (l.linkedin_url) b.icp += 4;
  b.icp = Math.min(b.icp, 30);
  // Contact quality (20)
  const em = String(l.email || "").toLowerCase().trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
    b.contact += 8;
    if (!ROLE_PREFIX.some((p) => em.startsWith(p))) b.contact += 4;
    if (!FREE_MAIL.some((d) => em.includes(d))) b.contact += 4;
  }
  const nm = String(l.full_name || "").trim();
  if (/^[A-Za-z][A-Za-z .'-]{3,}$/.test(nm) && nm.split(/\s+/).length >= 2
      && !/clinic|hospital|hotel|cafe|restaurant|classes|center|centre|solutions/i.test(nm)) b.contact += 4;
  // Engagement (35)
  if (l.reply_received) {
    b.engagement += 20;
    if (/positive|interested|pricing|meeting/i.test(String(l.reply_class || ""))) b.engagement += 8;
  }
  b.engagement += Math.min(Number(l.sent_count || 0), 5);
  if (Number(l.inbox_threads || 0) > 0) b.engagement += 5;
  b.engagement = Math.min(b.engagement, 35);
  // Referral (10)
  if (String(l.source || "").toLowerCase() === "referral") b.referral = 10;
  // Recency (5)
  if (l.last_activity_at) {
    const days = (Date.now() - new Date(l.last_activity_at).getTime()) / 86400000;
    if (days < 7) b.recency = 5;
    else if (days < 30) b.recency = 2;
  }
  const score = Math.min(100, b.icp + b.contact + b.engagement + b.referral + b.recency);
  return { score, band: bandFor(score), breakdown: b };
}

export async function rescoreTick(opts: { max?: number } = {}): Promise<{ rescored: number; changed: number }> {
  const max = Math.min(Math.max(opts.max || 50, 1), 200);
  const rows = await pool.query(
    `SELECT l.id, l.industry, l.country, l.business_website, l.phone, l.company_size, l.linkedin_url,
            l.email, l.full_name, l.source, l.reply_received, l.reply_class, l.lead_score,
            l.last_contacted_at, l.last_inbound_email_at,
            (SELECT count(*)::int FROM outreach_events e WHERE e.lead_id = l.id AND e.status = 'sent') AS sent_count,
            (SELECT count(DISTINCT thread_id)::int FROM inbox_messages m WHERE m.lead_id = l.id) AS inbox_threads
     FROM leads l
     WHERE COALESCE(l.status, 'active') NOT IN ('replied','won','lost','do_not_contact','skipped')
        OR COALESCE(l.reply_received, false) = true
     ORDER BY COALESCE(l.reply_received, false) DESC, l.id DESC LIMIT $1`, [max]);
  let rescored = 0, changed = 0;
  for (const l of rows.rows as any[]) {
    const lastAct = l.last_inbound_email_at || l.last_contacted_at || null;
    const { score, band, breakdown } = computeScore({ ...l, last_activity_at: lastAct });
    const prev = Number(l.lead_score || 0);
    rescored++;
    if (Math.abs(score - prev) >= 5 || bandFor(prev) !== band) {
      changed++;
      await pool.query(`UPDATE leads SET lead_score = $2 WHERE id = $1`, [l.id, score]);
      await logDecision({ lead_id: l.id, trigger_text: "rescoreTick", action: "rescored", autonomy: "L1",
        reason: `score ${prev} → ${score} (${band})`, confidence: null, context: { breakdown }, result: "rescored" });
    }
  }
  return { rescored, changed };
}

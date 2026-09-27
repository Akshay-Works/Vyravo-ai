// ============================================================================
// SALES OS — company research (§5). Fetches a lead's PUBLIC homepage only
// (timeout + size caps, honest user-agent), extracts observable signals into
// leads.signals. Unknown stays unknown — nothing is ever fabricated. The
// existing outreach personalizer (pointWebsiteSignals) reads these signals,
// so research directly upgrades live outreach quality.
// ============================================================================
import { pool } from "@/db";
import { logDecision } from "./schema";


export async function ensureSignalsColumn(): Promise<void> {
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS signals jsonb`);
}

export interface SiteSignals {
  has_chatbot: boolean; has_booking: boolean; has_whatsapp: boolean;
  has_lead_form: boolean; has_phone: boolean; has_email: boolean;
  emails_found: string[]; title: string | null; description: string | null;
  fetched_at: string; source_url: string;
}

/** Pure extraction — tested with fixture HTML. */
export function extractSignals(html: string, url: string): SiteSignals {
  const h = String(html || "").slice(0, 300000);
  const emails = [...new Set(h.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])]
    .filter((e) => !/example\.|sentry|wix|wordpress/i.test(e)).slice(0, 5);
  const title = (h.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1]?.trim() || null;
  const desc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})/i) || [])[1]?.trim() || null;
  return {
    has_chatbot: /intercom|drift\.com|tidio|tawk\.to|crisp\.chat|freshchat|hubspot.*chat|livechat|chatbot/i.test(h),
    has_booking: /calendly|cal\.com|acuityscheduling|booksy|fresha|reserve|book-(a-table|appointment)|schedule.*(visit|call)/i.test(h),
    has_whatsapp: /wa\.me|whatsapp\.com|api\.whatsapp/i.test(h),
    has_lead_form: /<form[\s>]/i.test(h),
    has_phone: /href=["']tel:/i.test(h),
    has_email: /mailto:/i.test(h),
    emails_found: emails,
    title, description: desc,
    fetched_at: new Date().toISOString(), source_url: url.slice(0, 300),
  };
}

async function fetchPage(rawUrl: string): Promise<string | null> {
  let url = String(rawUrl || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (!/^https?:\/\/[^/]+\.[^/]+/i.test(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (VyravoAI lead-research; contact akshay.navale.work@gmail.com)", Accept: "text/html" },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 1024 * 1024) return null;
    const text = await res.text();
    return text.slice(0, 300000) || null;
  } catch {
    return null;
  }
}

export async function researchTick(opts: { max?: number; budgetMs?: number } = {}): Promise<{
  researched: number; failed: number; truncated: boolean;
}> {
  const max = Math.min(Math.max(opts.max || 3, 1), 10);
  const budget = opts.budgetMs || 15000;
  const t0 = Date.now();
  await ensureSignalsColumn();
  const out = { researched: 0, failed: 0, truncated: false };
  const cands = await pool.query(
    `SELECT id, business_website, signals FROM leads
     WHERE (stage IN ('new','READY_FOR_OUTREACH') OR stage IS NULL)
       AND business_website IS NOT NULL AND TRIM(business_website) <> ''
       AND (signals IS NULL OR signals->>'fetched_at' IS NULL)
       AND COALESCE((signals->>'attempts')::int, 0) < 3
     ORDER BY id DESC LIMIT $1`, [max]);
  for (const lead of cands.rows as any[]) {
    if (Date.now() - t0 > budget) { out.truncated = true; break; }
    const attempts = Number(lead.signals?.attempts || 0) + 1;
    try {
      const html = await fetchPage(lead.business_website);
      if (!html) throw new Error("unfetchable");
      const sig = extractSignals(html, lead.business_website);
      await pool.query(`UPDATE leads SET signals = COALESCE(signals,'{}') || $2 WHERE id = $1`,
        [lead.id, JSON.stringify({ ...sig, attempts })]);
      const { emitSalesEvent } = await import("./lifecycle");
      await emitSalesEvent({ key: `researched-${lead.id}-${sig.has_chatbot}-${sig.has_booking}`, type: "LEAD_RESEARCHED", leadId: Number(lead.id), payload: { url: lead.business_website } });
      await logDecision({ lead_id: lead.id, trigger_text: "researchTick", to_stage: "researched",
        action: "researched", autonomy: "L1", reason: `signals: chat=${sig.has_chatbot} booking=${sig.has_booking} wa=${sig.has_whatsapp}`,
        context: { url: lead.business_website }, result: "researched" });
      out.researched++;
    } catch (e: any) {
      out.failed++;
      await pool.query(`UPDATE leads SET signals = COALESCE(signals,'{}') || $2 WHERE id = $1`,
        [lead.id, JSON.stringify({ attempts, last_error: String(e?.message || e).slice(0, 120) })]);
    }
  }
  return out;
}

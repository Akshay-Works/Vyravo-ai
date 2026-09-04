// ============================================================================
// WHATSAPP OUTREACH CONFIG — kv store (whatsapp_config table, auto-created).
// Same pattern as email + LinkedIn outreach configs. Defaults are SAFE:
// sending OFF, approval ON, TEST MODE ON, 30/day, 2-min gap, FU day 3 & 7.
// ============================================================================
import { pool } from "@/db";

export interface WhatsAppConfig {
  enabled: boolean;           // sending ON/OFF (never sends while OFF)
  approval_required: boolean; // human must approve before a message enters the queue
  test_mode: boolean;         // ON → generate + queue real messages, simulate sends only
  require_opt_in: boolean;    // ON → leads with Opt-In status != 'opted_in' are NOT eligible
  daily_limit: number;        // max WhatsApp messages actually sent per day
  min_delay_min: number;      // min minutes between consecutive sends
  max_per_run: number;        // max messages processed per send execution
  follow_up_days: number[];   // e.g. [3, 7] → follow-up 1 after 3d, follow-up 2 after 7d (from intro sent_at)
  min_score: number;          // only leads >= this score are eligible
  campaign_id: string;        // labels this channel's campaign (duplicate/keying)
  emergency_stop: boolean;    // STOP ALL WHATSAPP OUTREACH — blocks every send
}

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  enabled: false,
  approval_required: true,
  test_mode: true,            // production default = TEST MODE ON (spec §27)
  require_opt_in: true,       // never assume a phone number = WhatsApp consent
  daily_limit: 30,
  min_delay_min: 2,
  max_per_run: 10,
  follow_up_days: [3, 7],
  min_score: 60,
  campaign_id: "whatsapp-outreach-main",
  emergency_stop: false,
};

const SAFE_CAMPAIGN = /^[a-z0-9_-]{2,60}$/i;

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  try {
    const r = await pool.query(`SELECT k, v FROM whatsapp_config`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.k] = row.v;
    const num = (k: string, d: number) => {
      const v = Number(map[k]);
      return Number.isFinite(v) && v >= 0 ? v : d;
    };
    let days: number[];
    try { days = JSON.parse(map.follow_up_days || "[]").map(Number).filter((n: number) => n > 0); } catch { days = []; }
    if (!days.length) days = [...DEFAULT_WHATSAPP_CONFIG.follow_up_days];
    return {
      enabled: map.enabled === "true",
      approval_required: map.approval_required !== "false",
      test_mode: map.test_mode !== "false",            // default ON
      require_opt_in: map.require_opt_in !== "false",  // default ON
      daily_limit: num("daily_limit", DEFAULT_WHATSAPP_CONFIG.daily_limit),
      min_delay_min: num("min_delay_min", DEFAULT_WHATSAPP_CONFIG.min_delay_min),
      max_per_run: num("max_per_run", DEFAULT_WHATSAPP_CONFIG.max_per_run),
      follow_up_days: days.slice(0, 3),
      min_score: num("min_score", DEFAULT_WHATSAPP_CONFIG.min_score),
      campaign_id: SAFE_CAMPAIGN.test(map.campaign_id || "") ? map.campaign_id : DEFAULT_WHATSAPP_CONFIG.campaign_id,
      emergency_stop: map.emergency_stop === "true",
    };
  } catch {
    return { ...DEFAULT_WHATSAPP_CONFIG };
  }
}

export async function saveWhatsAppConfig(partial: Partial<WhatsAppConfig>): Promise<WhatsAppConfig> {
  const cur = await getWhatsAppConfig();
  const next: WhatsAppConfig = { ...cur, ...partial };
  // sanitize
  next.daily_limit = Math.min(Math.max(Math.round(next.daily_limit || 0), 0), 500);
  next.min_delay_min = Math.min(Math.max(Math.round(next.min_delay_min || 0), 0), 1440);
  next.max_per_run = Math.min(Math.max(Math.round(next.max_per_run || 0), 1), 50);
  next.min_score = Math.min(Math.max(Math.round(next.min_score || 0), 0), 100);
  next.follow_up_days = Array.isArray(next.follow_up_days)
    ? next.follow_up_days.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 3)
    : cur.follow_up_days;
  if (!SAFE_CAMPAIGN.test(next.campaign_id || "")) next.campaign_id = DEFAULT_WHATSAPP_CONFIG.campaign_id;

  const entries: [string, string][] = [
    ["enabled", String(next.enabled)],
    ["approval_required", String(next.approval_required)],
    ["test_mode", String(next.test_mode)],
    ["require_opt_in", String(next.require_opt_in)],
    ["daily_limit", String(next.daily_limit)],
    ["min_delay_min", String(next.min_delay_min)],
    ["max_per_run", String(next.max_per_run)],
    ["follow_up_days", JSON.stringify(next.follow_up_days)],
    ["min_score", String(next.min_score)],
    ["campaign_id", next.campaign_id],
    ["emergency_stop", String(next.emergency_stop)],
  ];
  for (const [k, v] of entries) {
    await pool.query(
      `INSERT INTO whatsapp_config (k, v) VALUES ($1, $2)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [k, v]
    );
  }
  return next;
}

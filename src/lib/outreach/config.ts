// ============================================================================
// OUTREACH CONFIG — kv store (outreach_config table, auto-created).
// All knobs for the automated outreach pipeline. Defaults are SAFE:
// auto outreach OFF, test mode OFF, 30/day, follow-ups at day 3 & 7.
// ============================================================================
import { pool } from "@/db";

export interface OutreachConfig {
  auto_outreach: boolean;      // ON → qualified new leads are queued AND sent (per daily limit)
  test_mode: boolean;          // ON → every send goes to test_recipient instead of the lead
  test_recipient: string;      // used ONLY in test mode
  daily_limit: number;         // max production emails sent per day
  follow_up_days: number[];    // e.g. [3, 7] → follow-up 1 after 3d, follow-up 2 after 7d
  min_gap_secs: number;        // min delay between consecutive sends (Resend-friendly)
  min_score: number;           // only leads >= this score enter the pipeline
}

export const DEFAULT_CONFIG: OutreachConfig = {
  auto_outreach: false,
  test_mode: false,
  test_recipient: "akshay.navale.work@gmail.com",
  daily_limit: 30,
  follow_up_days: [3, 7],
  min_gap_secs: 20,
  min_score: 60,
};

export async function getOutreachConfig(): Promise<OutreachConfig> {
  try {
    const r = await pool.query(`SELECT k, v FROM outreach_config`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.k] = row.v;
    const num = (k: string, d: number) => {
      const v = Number(map[k]);
      return Number.isFinite(v) && v > 0 ? v : d;
    };
    let days: number[];
    try { days = JSON.parse(map.follow_up_days || "[]").map(Number).filter((n: number) => n > 0); } catch { days = []; }
    if (!days.length) days = [...DEFAULT_CONFIG.follow_up_days];
    return {
      auto_outreach: map.auto_outreach === "true",
      test_mode: map.test_mode === "true",
      test_recipient: map.test_recipient || DEFAULT_CONFIG.test_recipient,
      daily_limit: num("daily_limit", DEFAULT_CONFIG.daily_limit),
      follow_up_days: days.slice(0, 3),
      min_gap_secs: num("min_gap_secs", DEFAULT_CONFIG.min_gap_secs),
      min_score: num("min_score", DEFAULT_CONFIG.min_score),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveOutreachConfig(partial: Partial<OutreachConfig>): Promise<OutreachConfig> {
  const cur = await getOutreachConfig();
  const next: OutreachConfig = { ...cur, ...partial };
  // sanitize
  next.daily_limit = Math.min(Math.max(Math.round(next.daily_limit || 0), 0), 500);
  next.min_gap_secs = Math.min(Math.max(Math.round(next.min_gap_secs || 0), 0), 3600);
  next.min_score = Math.min(Math.max(Math.round(next.min_score || 0), 0), 100);
  next.follow_up_days = Array.isArray(next.follow_up_days)
    ? next.follow_up_days.map(Number).filter((n) => Number.isFinite(n) && n >= 0).slice(0, 3)
    : cur.follow_up_days;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.test_recipient || "")) next.test_recipient = DEFAULT_CONFIG.test_recipient;

  const entries: [string, string][] = [
    ["auto_outreach", String(next.auto_outreach)],
    ["test_mode", String(next.test_mode)],
    ["test_recipient", next.test_recipient],
    ["daily_limit", String(next.daily_limit)],
    ["follow_up_days", JSON.stringify(next.follow_up_days)],
    ["min_gap_secs", String(next.min_gap_secs)],
    ["min_score", String(next.min_score)],
  ];
  for (const [k, v] of entries) {
    await pool.query(
      `INSERT INTO outreach_config (k, v) VALUES ($1, $2)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [k, v]
    );
  }
  return next;
}

// ============================================================================
// LINKEDIN OUTREACH CONFIG — kv store (linkedin_config table, auto-created).
// Same pattern as the email outreach config. Defaults are SAFE:
// sending OFF, approval required ON, 10/day, 10 min gap, follow-ups day 3 & 7.
// ============================================================================
import { pool } from "@/db";

export interface LinkedInConfig {
  enabled: boolean;          // sending ON/OFF (never sends while OFF)
  approval_required: boolean;// human must approve before a message enters the send queue
  test_mode: boolean;        // generate + queue real messages, simulate sending only
  daily_limit: number;       // max LinkedIn messages actually sent per day
  min_delay_min: number;     // min minutes between consecutive sends
  max_per_run: number;       // max messages processed per send execution
  follow_up_days: number[];  // e.g. [3, 7] → follow-up 1 after 3d, follow-up 2 after 7d (from intro sent_at)
  min_score: number;         // only leads >= this score are eligible
  emergency_stop: boolean;   // STOP ALL OUTREACH — blocks every send immediately
}

export const DEFAULT_LINKEDIN_CONFIG: LinkedInConfig = {
  enabled: false,
  approval_required: true,
  test_mode: false,
  daily_limit: 10,
  min_delay_min: 10,
  max_per_run: 5,
  follow_up_days: [3, 7],
  min_score: 60,
  emergency_stop: false,
};

export async function getLinkedInConfig(): Promise<LinkedInConfig> {
  try {
    const r = await pool.query(`SELECT k, v FROM linkedin_config`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.k] = row.v;
    const num = (k: string, d: number) => {
      const v = Number(map[k]);
      return Number.isFinite(v) && v >= 0 ? v : d;
    };
    let days: number[];
    try { days = JSON.parse(map.follow_up_days || "[]").map(Number).filter((n: number) => n > 0); } catch { days = []; }
    if (!days.length) days = [...DEFAULT_LINKEDIN_CONFIG.follow_up_days];
    return {
      enabled: map.enabled === "true",
      approval_required: map.approval_required !== "false", // default ON
      test_mode: map.test_mode === "true",
      daily_limit: num("daily_limit", DEFAULT_LINKEDIN_CONFIG.daily_limit),
      min_delay_min: num("min_delay_min", DEFAULT_LINKEDIN_CONFIG.min_delay_min),
      max_per_run: num("max_per_run", DEFAULT_LINKEDIN_CONFIG.max_per_run),
      follow_up_days: days.slice(0, 3),
      min_score: num("min_score", DEFAULT_LINKEDIN_CONFIG.min_score),
      emergency_stop: map.emergency_stop === "true",
    };
  } catch {
    return { ...DEFAULT_LINKEDIN_CONFIG };
  }
}

export async function saveLinkedInConfig(partial: Partial<LinkedInConfig>): Promise<LinkedInConfig> {
  const cur = await getLinkedInConfig();
  const next: LinkedInConfig = { ...cur, ...partial };
  // sanitize
  next.daily_limit = Math.min(Math.max(Math.round(next.daily_limit || 0), 0), 200);
  next.min_delay_min = Math.min(Math.max(Math.round(next.min_delay_min || 0), 0), 1440);
  next.max_per_run = Math.min(Math.max(Math.round(next.max_per_run || 0), 1), 50);
  next.min_score = Math.min(Math.max(Math.round(next.min_score || 0), 0), 100);
  next.follow_up_days = Array.isArray(next.follow_up_days)
    ? next.follow_up_days.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 3)
    : cur.follow_up_days;

  const entries: [string, string][] = [
    ["enabled", String(next.enabled)],
    ["approval_required", String(next.approval_required)],
    ["test_mode", String(next.test_mode)],
    ["daily_limit", String(next.daily_limit)],
    ["min_delay_min", String(next.min_delay_min)],
    ["max_per_run", String(next.max_per_run)],
    ["follow_up_days", JSON.stringify(next.follow_up_days)],
    ["min_score", String(next.min_score)],
    ["emergency_stop", String(next.emergency_stop)],
  ];
  for (const [k, v] of entries) {
    await pool.query(
      `INSERT INTO linkedin_config (k, v) VALUES ($1, $2)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [k, v]
    );
  }
  return next;
}

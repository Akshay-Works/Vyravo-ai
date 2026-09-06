// ============================================================
// FOREIGN ENGINE — admin settings (foreign_config KV table).
// Mirrors the engine's defaults; the engine pulls the snapshot at
// run start via /api/foreign/runtime. Pause/resume lives here too.
// ============================================================
import { pool } from "@/db";
import { ensureForeignSchema } from "./schema";

export type ForeignSettings = {
  dailyDirect: number;
  dailyAgency: number;
  minScore: number;
  requireVerifiedEmail: boolean;
  requireDecisionMaker: boolean;
  avoidExisting: boolean;
  countries: string[];
  industries: string[];
  paused: boolean;
  geoapifyQueries: number;
  maxGeminiCalls: number;
};

export const DEFAULT_FOREIGN_SETTINGS: ForeignSettings = {
  dailyDirect: 25,
  dailyAgency: 12,
  minScore: 60,
  requireVerifiedEmail: false,
  requireDecisionMaker: false,
  avoidExisting: true,
  countries: ["us", "gb", "au", "ca", "ae", "sg", "nz", "ie", "de", "nl"],
  industries: [],
  paused: false,
  geoapifyQueries: 20,
  maxGeminiCalls: 150,
};

const s = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : d;
};

export async function getForeignSettings(): Promise<ForeignSettings> {
  await ensureForeignSchema();
  const r = await pool.query(`SELECT k, v FROM foreign_config`);
  const kv: Record<string, string> = {};
  for (const row of r.rows) kv[row.k] = row.v;
  const parse = (k: string, d: unknown) => {
    if (kv[k] === undefined) return d;
    try { return JSON.parse(kv[k]); } catch { return d; }
  };
  const base = DEFAULT_FOREIGN_SETTINGS;
  return {
    dailyDirect: s(kv.daily_direct, base.dailyDirect),
    dailyAgency: s(kv.daily_agency, base.dailyAgency),
    minScore: s(kv.min_score, base.minScore),
    requireVerifiedEmail: Boolean(parse("require_verified_email", base.requireVerifiedEmail)),
    requireDecisionMaker: Boolean(parse("require_decision_maker", base.requireDecisionMaker)),
    avoidExisting: Boolean(parse("avoid_existing", base.avoidExisting)),
    countries: Array.isArray(parse("countries", base.countries)) ? parse("countries", base.countries).map(String).slice(0, 20) : base.countries,
    industries: Array.isArray(parse("industries", base.industries)) ? parse("industries", base.industries).map(String).slice(0, 40) : base.industries,
    paused: Boolean(parse("paused", base.paused)),
    geoapifyQueries: s(kv.geoapify_queries, base.geoapifyQueries),
    maxGeminiCalls: s(kv.max_gemini_calls, base.maxGeminiCalls),
  };
}

export async function saveForeignSettings(patch: Partial<ForeignSettings>): Promise<ForeignSettings> {
  await ensureForeignSchema();
  const map: Record<string, string> = {
    dailyDirect: "daily_direct",
    dailyAgency: "daily_agency",
    minScore: "min_score",
    requireVerifiedEmail: "require_verified_email",
    requireDecisionMaker: "require_decision_maker",
    avoidExisting: "avoid_existing",
    countries: "countries",
    industries: "industries",
    paused: "paused",
    geoapifyQueries: "geoapify_queries",
    maxGeminiCalls: "max_gemini_calls",
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key as keyof ForeignSettings] === undefined) continue;
    await pool.query(`INSERT INTO foreign_config (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`, [
      col, JSON.stringify(patch[key as keyof ForeignSettings]),
    ]);
  }
  return getForeignSettings();
}

// ============================================================================
// SALES OS — experimentation engine v1 (§25). Deterministic weighted splits,
// single-variable changes, reply/outcome attribution. SAFE BY DEFAULT: if no
// ACTIVE experiment exists, every caller runs exact control behavior.
// First wired experiment: 'fu1_gap' (FU1 at day 3 vs day 5).
// ============================================================================
import { pool } from "@/db";
import { createHash } from "crypto";

export async function ensureExperimentSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_experiments (
      id serial PRIMARY KEY, name text UNIQUE NOT NULL, description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'paused', variants jsonb NOT NULL DEFAULT '[]',
      winner text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_experiment_assignments (
      experiment text NOT NULL, lead_id integer NOT NULL, variant text NOT NULL,
      created_at timestamptz DEFAULT now(), UNIQUE (experiment, lead_id)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_experiment_outcomes (
      id serial PRIMARY KEY, experiment text NOT NULL, lead_id integer NOT NULL,
      variant text NOT NULL, outcome text NOT NULL, value double precision,
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_exp_outcomes ON sales_experiment_outcomes(experiment, variant, outcome)`);
}

function pickWeighted(variants: { key: string; weight: number }[], seed: string): string {
  const total = variants.reduce((s, v) => s + Math.max(0, Number(v.weight) || 0), 0) || 1;
  const h = createHash("sha256").update(seed).digest();
  let r = (h.readUInt32BE(0) / 0xffffffff) * total;
  for (const v of variants) {
    r -= Math.max(0, Number(v.weight) || 0);
    if (r <= 0) return v.key;
  }
  return variants[0].key;
}

/** Enroll (or fetch existing enrollment). Never throws, never blocks. */
export async function assignVariant(expName: string, leadId: number): Promise<{ enrolled: boolean; variant: string }> {
  try {
    await ensureExperimentSchema();
    const ex = await pool.query(`SELECT variants FROM sales_experiments WHERE name = $1 AND status = 'active'`, [expName]);
    if ((ex.rowCount ?? 0) === 0) return { enrolled: false, variant: "control" };
    const variants = (ex.rows[0].variants || []) as { key: string; weight: number }[];
    if (!variants.length) return { enrolled: false, variant: "control" };
    const prior = await pool.query(`SELECT variant FROM sales_experiment_assignments WHERE experiment = $1 AND lead_id = $2`, [expName, leadId]);
    if ((prior.rowCount ?? 0) > 0) return { enrolled: true, variant: String(prior.rows[0].variant) };
    const variant = pickWeighted(variants, `${expName}:${leadId}`);
    await pool.query(`INSERT INTO sales_experiment_assignments (experiment, lead_id, variant) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [expName, leadId, variant]);
    return { enrolled: true, variant };
  } catch {
    return { enrolled: false, variant: "control" };
  }
}

/** Attribute an outcome to every experiment the lead is enrolled in. */
export async function trackOutcome(leadId: number, outcome: string, value?: number): Promise<void> {
  try {
    const rows = await pool.query(`SELECT experiment, variant FROM sales_experiment_assignments WHERE lead_id = $1`, [leadId]);
    for (const r of rows.rows as any[]) {
      await pool.query(`INSERT INTO sales_experiment_outcomes (experiment, lead_id, variant, outcome, value) VALUES ($1,$2,$3,$4,$5)`,
        [r.experiment, leadId, r.variant, outcome, value ?? null]);
    }
  } catch { /* attribution must never break the caller */ }
}

export async function getExperimentResults(): Promise<any[]> {
  await ensureExperimentSchema();
  const exps = await pool.query(`SELECT name, description, status, variants, winner FROM sales_experiments ORDER BY id`);
  const out: any[] = [];
  for (const e of exps.rows as any[]) {
    const by = await pool.query(
      `SELECT a.variant, count(DISTINCT a.lead_id)::int AS enrolled,
              count(DISTINCT o.lead_id) FILTER (WHERE o.outcome = 'replied')::int AS replied,
              count(DISTINCT o.lead_id) FILTER (WHERE o.outcome = 'positive')::int AS positive
       FROM sales_experiment_assignments a LEFT JOIN sales_experiment_outcomes o
         ON o.experiment = a.experiment AND o.lead_id = a.lead_id
       WHERE a.experiment = $1 GROUP BY 1`, [e.name]);
    out.push({ ...e, results: by.rows });
  }
  return out;
}

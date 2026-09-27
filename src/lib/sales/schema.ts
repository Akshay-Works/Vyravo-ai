// ============================================================================
// SALES OS — schema + guards. Additive only. Every autonomous sales action is
// logged to sales_decisions (§30 observability); everything needing the
// founder becomes a sales_escalations row (§22); suppression_list + the
// global pause (§26/§28) protect reputation.
// ============================================================================
import { pool } from "@/db";

export async function ensureSalesSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_decisions (
      id serial PRIMARY KEY,
      created_at timestamptz DEFAULT now(),
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      trigger_text text NOT NULL DEFAULT '',
      from_stage text,
      to_stage text,
      action text NOT NULL DEFAULT 'none',
      autonomy text NOT NULL DEFAULT 'none',
      reason text NOT NULL DEFAULT '',
      confidence double precision,
      context jsonb NOT NULL DEFAULT '{}',
      result text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'done',
      error_message text
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_decisions_lead ON sales_decisions(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_decisions_created ON sales_decisions(created_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_escalations (
      id serial PRIMARY KEY,
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      kind text NOT NULL,
      title text NOT NULL,
      detail text NOT NULL DEFAULT '',
      recommendation text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'open',
      created_at timestamptz DEFAULT now(),
      resolved_at timestamptz,
      resolved_by text
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_escalations_status ON sales_escalations(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_escalations_lead ON sales_escalations(lead_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppression_list (
      email text PRIMARY KEY,
      reason text NOT NULL DEFAULT '',
      source text NOT NULL DEFAULT '',
      created_at timestamptz DEFAULT now()
    )`);
}

export async function logDecision(d: {
  lead_id?: number | null; trigger_text?: string; from_stage?: string | null; to_stage?: string | null;
  action?: string; autonomy?: string; reason?: string; confidence?: number | null;
  context?: any; result?: string; status?: string; error_message?: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sales_decisions (lead_id, trigger_text, from_stage, to_stage, action, autonomy, reason, confidence, context, result, status, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [d.lead_id ?? null, d.trigger_text || "", d.from_stage || null, d.to_stage || null,
       d.action || "none", d.autonomy || "none", d.reason || "", d.confidence ?? null,
       JSON.stringify(d.context || {}), d.result || "", d.status || "done", d.error_message || null]);
  } catch (e) {
    console.error("sales decision log failed (non-fatal):", e);
  }
}

/** Create escalation unless an identical open one exists (dedupe). */
export async function createEscalation(e: {
  lead_id?: number | null; kind: string; title: string; detail?: string; recommendation?: string;
}): Promise<{ id: number; duplicate: boolean }> {
  const dup = await pool.query(
    `SELECT id FROM sales_escalations WHERE lead_id IS NOT DISTINCT FROM $1 AND kind = $2 AND status = 'open' LIMIT 1`,
    [e.lead_id ?? null, e.kind]);
  if ((dup.rowCount ?? 0) > 0) return { id: Number(dup.rows[0].id), duplicate: true };
  const ins = await pool.query(
    `INSERT INTO sales_escalations (lead_id, kind, title, detail, recommendation, status)
     VALUES ($1,$2,$3,$4,$5,'open') RETURNING id`,
    [e.lead_id ?? null, e.kind, e.title.slice(0, 200), (e.detail || "").slice(0, 2000), (e.recommendation || "").slice(0, 1000)]);
  return { id: Number(ins.rows[0].id), duplicate: false };
}

export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const r = await pool.query(`SELECT 1 FROM suppression_list WHERE email = $1 LIMIT 1`, [String(email || "").toLowerCase().trim()]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function addSuppression(email: string, reason: string, source: string): Promise<void> {
  const em = String(email || "").toLowerCase().trim();
  if (!em || !em.includes("@")) return;
  try {
    await pool.query(`INSERT INTO suppression_list (email, reason, source) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
      [em, reason.slice(0, 200), source.slice(0, 60)]);
  } catch (e) {
    console.error("suppression insert failed (non-fatal):", e);
  }
}

/**
 * Global sales pause (§28) + automatic reputation guard (§26).
 * Manual: outreach_config sales_paused=true. Auto: bounce rate >10% over
 * the last 24h (min 10 sends). Transactional mail is NEVER paused here —
 * callers are sales send paths only.
 */
export async function isSalesPaused(): Promise<{ paused: boolean; reason: string | null }> {
  try {
    const flag = await pool.query(`SELECT v FROM outreach_config WHERE k = 'sales_paused'`);
    if (String(flag.rows[0]?.v || "").toLowerCase() === "true")
      return { paused: true, reason: "manual pause (sales_paused)" };
    const r = await pool.query(`
      SELECT count(*) FILTER (WHERE failed_at > now() - interval '24 hours'
          AND error_message ILIKE '%bounc%')::int AS bounces,
        count(*) FILTER (WHERE sent_at > now() - interval '24 hours')::int AS sent`);
    const bounces = Number(r.rows[0]?.bounces || 0);
    const sent = Number(r.rows[0]?.sent || 0);
    if (sent >= 10 && bounces / sent > 0.1)
      return { paused: true, reason: `bounce rate ${(100 * bounces / sent).toFixed(0)}% last 24h (${bounces}/${sent})` };
    return { paused: false, reason: null };
  } catch {
    return { paused: false, reason: null };
  }
}

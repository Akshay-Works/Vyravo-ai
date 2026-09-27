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

  // Lifecycle event log + idempotency keys (every event processed exactly once).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_events (
      id serial PRIMARY KEY,
      event_key text UNIQUE NOT NULL,
      event_type text NOT NULL,
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      payload jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz DEFAULT now(),
      processed_at timestamptz,
      result text NOT NULL DEFAULT ''
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_events_lead ON sales_events(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_events_type ON sales_events(event_type)`);

  // Invoice/payment ledger (provider-agnostic; Stripe-ready, manual until then).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_invoices (
      id serial PRIMARY KEY,
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      proposal_id integer,
      invoice_no text UNIQUE NOT NULL,
      amount numeric NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'INR',
      status text NOT NULL DEFAULT 'draft',
      provider text NOT NULL DEFAULT 'manual',
      provider_ref text UNIQUE,
      payment_id text,
      payment_link text,
      due_date timestamptz,
      paid_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_invoices_lead ON sales_invoices(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status)`);

  // Lead commercial fields (additive; safe on every boot).
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value numeric`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_currency text DEFAULT 'INR'`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action text`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_date timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by_lead_id integer REFERENCES leads(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contacted_at timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_channel text`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_message_id text`);
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
  const newId = Number(ins.rows[0].id);
  // Founder notification (§22): always for deal-critical kinds; otherwise
  // only for high-value (score ≥ 80) leads. Fire-and-forget, never blocks.
  try {
    const critical = ["deal_won", "negotiation", "meeting_booked"].includes(e.kind);
    let score = 0;
    if (e.lead_id) {
      const lr = await pool.query(`SELECT lead_score, business_name, email FROM leads WHERE id = $1`, [e.lead_id]);
      score = Number(lr.rows[0]?.lead_score || 0);
      var leadCtx = lr.rows[0];
    }
    if (critical || score >= 80) {
      const to = (process.env.REPORT_EMAIL || process.env.EMAIL_USER || "").trim();
      if (to) {
        const { sendEmail } = await import("@/lib/email/send");
        const esc = (s: any) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 800);
        const nm = (leadCtx as any)?.business_name || (leadCtx as any)?.email || `lead ${e.lead_id}`;
        await sendEmail({
          to, replyTo: process.env.ADMIN_REPLY_TO || undefined,
          subject: `⚡ Sales action: ${e.title.slice(0, 80)}`,
          html: `<p><b>WHY:</b> ${esc(e.kind)} needs founder input.</p><p><b>WHAT HAPPENED:</b> ${esc(nm)} — ${esc(e.detail)}</p><p><b>AI RECOMMENDS:</b> ${esc(e.recommendation)}</p><p><b>YOU NEED TO:</b> open Admin → Sales → Founder Actions (escalation #${newId}).</p>`,
        });
      }
    }
  } catch { /* notification failure must never break escalation creation */ }
  return { id: newId, duplicate: false };
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

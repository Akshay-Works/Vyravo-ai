// ============================================================================
// EMAIL INTELLIGENCE — schema (idempotent, additive only). No parallel CRM:
// threads link to the existing leads table; actions reuse outreach_events /
// email_queue / activities. Message-IDs are the idempotency keys.
// ============================================================================
import { pool } from "@/db";

export async function ensureInboxSchema(): Promise<void> {
  // ---- synced inbound messages (one row per email, never duplicated) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id serial PRIMARY KEY,
      message_id text NOT NULL UNIQUE,
      thread_id text NOT NULL,
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      direction text NOT NULL DEFAULT 'in',
      from_email text NOT NULL,
      from_name text,
      to_emails text[] NOT NULL DEFAULT '{}',
      cc_emails text[] NOT NULL DEFAULT '{}',
      subject text NOT NULL DEFAULT '',
      body_text text NOT NULL DEFAULT '',
      sent_at timestamptz,
      status text NOT NULL DEFAULT 'new',
      classification text,
      confidence double precision,
      reply_required boolean,
      ai_reply_subject text,
      ai_reply_body text,
      ai_confidence double precision,
      reviewed_by text,
      reviewed_at timestamptz,
      sent_message_id text,
      follow_up_due_at timestamptz,
      error_message text,
      created_at timestamptz DEFAULT now(),
      processed_at timestamptz
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_messages_status ON inbox_messages(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_messages_lead ON inbox_messages(lead_id)`);

  // ---- people / emails extracted from a message (referrals, CCs, …) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbox_contacts (
      id serial PRIMARY KEY,
      message_id text NOT NULL REFERENCES inbox_messages(message_id) ON DELETE CASCADE,
      email text NOT NULL,
      name text,
      title text,
      company text,
      phone text,
      linkedin text,
      relationship text,
      reason text,
      confidence double precision,
      recommended_action text NOT NULL DEFAULT 'review',
      lead_id integer REFERENCES leads(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'new',
      created_at timestamptz DEFAULT now(),
      UNIQUE (message_id, email)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_contacts_email ON inbox_contacts(lower(email))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_contacts_status ON inbox_contacts(status)`);

  // ---- per-thread preferences (admin can disable auto-reply per thread) ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbox_thread_prefs (
      thread_id text PRIMARY KEY,
      auto_reply boolean NOT NULL DEFAULT true,
      updated_at timestamptz DEFAULT now()
    )`);

  // ---- audit log: every automated email action, forever ----
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbox_audit (
      id serial PRIMARY KEY,
      message_id text,
      thread_id text,
      lead_id integer,
      action text NOT NULL,
      actor text NOT NULL DEFAULT 'system',
      detail jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_audit_message ON inbox_audit(message_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_inbox_audit_created ON inbox_audit(created_at)`);
}

export async function auditInbox(
  entry: { message_id?: string | null; thread_id?: string | null; lead_id?: number | null; action: string; actor?: string; detail?: any }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO inbox_audit (message_id, thread_id, lead_id, action, actor, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.message_id || null, entry.thread_id || null, entry.lead_id || null,
       entry.action, entry.actor || "system", JSON.stringify(entry.detail || {})]
    );
  } catch (e) {
    console.error("inbox audit failed (non-fatal):", e);
  }
}

/** Inbox knobs — same outreach_config kv table, own keys, safe defaults. */
export async function getInboxConfig(): Promise<{
  auto_reply: boolean; daily_cap: number; min_conf: number; review_at: number;
}> {
  try {
    const r = await pool.query(`SELECT k, v FROM outreach_config WHERE k LIKE 'inbox\\_%'`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.k] = row.v;
    const num = (k: string, d: number) => {
      const v = Number(map[k]);
      return Number.isFinite(v) ? v : d;
    };
    return {
      auto_reply: map.inbox_auto_reply !== "false", // ON unless explicitly disabled
      daily_cap: Math.min(Math.max(Math.round(num("inbox_daily_cap", 25)), 0), 200),
      min_conf: Math.min(Math.max(num("inbox_min_conf", 0.9), 0), 1),
      review_at: Math.min(Math.max(num("inbox_review_at", 0.75), 0), 1),
    };
  } catch {
    return { auto_reply: true, daily_cap: 25, min_conf: 0.9, review_at: 0.75 };
  }
}

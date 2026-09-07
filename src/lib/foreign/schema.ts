// ============================================================
// FOREIGN ENGINE — idempotent schema (run on every hit, like
// ensureOutreachSchema). All statements are ADD COLUMN IF NOT
// EXISTS / CREATE TABLE IF NOT EXISTS — fully backward-compatible:
// existing rows and the existing outreach pipeline keep working,
// new columns simply stay NULL for old records.
// ============================================================
import { pool } from "@/db";

export async function ensureForeignSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS city text,
      ADD COLUMN IF NOT EXISTS first_name text,
      ADD COLUMN IF NOT EXISTS last_name text,
      ADD COLUMN IF NOT EXISTS job_title text,
      ADD COLUMN IF NOT EXISTS email_verification_status text,
      ADD COLUMN IF NOT EXISTS email_verification_source text,
      ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS why_this_lead text,
      ADD COLUMN IF NOT EXISTS recommended_offer text,
      ADD COLUMN IF NOT EXISTS outreach_drafts jsonb,
      ADD COLUMN IF NOT EXISTS score_reasons jsonb,
      ADD COLUMN IF NOT EXISTS agency_type text,
      ADD COLUMN IF NOT EXISTS agency_services jsonb,
      ADD COLUMN IF NOT EXISTS white_label_fit text,
      ADD COLUMN IF NOT EXISTS partnership_angle text,
      ADD COLUMN IF NOT EXISTS website_ok boolean,
      ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz,
      ADD COLUMN IF NOT EXISTS contact_priority integer -- Lead Data Quality Rule: 1-4 (0 = rejected)
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON leads(lead_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_country ON leads(country)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_verification ON leads(email_verification_status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS foreign_runs (
      id serial PRIMARY KEY,
      trigger text NOT NULL DEFAULT 'schedule',
      mode text NOT NULL DEFAULT 'normal',
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      leads_discovered int DEFAULT 0,
      leads_qualified int DEFAULT 0,
      emails_found int DEFAULT 0,
      emails_verified int DEFAULT 0,
      duplicates_removed int DEFAULT 0,
      leads_saved int DEFAULT 0,
      leads_merged int DEFAULT 0,
      failed int DEFAULT 0,
      errors int DEFAULT 0,
      status text NOT NULL DEFAULT 'running',
      error text,
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS foreign_config (k text PRIMARY KEY, v text NOT NULL)`);
}

// Lead-stage constants shared by routes + engine contract
export const FOREIGN_LEAD_TYPES = ["FOREIGN_CLIENT", "WHITE_LABEL_AGENCY"] as const;
export const FOREIGN_STAGES = [
  "NEW", "RESEARCHED", "QUALIFIED", "READY_FOR_OUTREACH", "CONTACTED", "REPLIED",
  "CALL_BOOKED", "PROPOSAL", "WON", "LOST", "WHITE_LABEL_PROSPECT", "PARTNERSHIP_CONTACTED",
  "INTERESTED", "PARTNERSHIP_CALL", "ACTIVE_PARTNER",
] as const;
export const EMAIL_STATUSES = ["VERIFIED", "LIKELY", "UNKNOWN", "INVALID"] as const;

// spec: 80–100 HOT · 60–79 HIGH · 40–59 MEDIUM · <40 LOW
export const foreignBucket = (score: number) =>
  score >= 80 ? "HOT" : score >= 60 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";

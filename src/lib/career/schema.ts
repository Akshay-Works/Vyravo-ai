// CareerPilot AI — isolated tables. NEVER touches leads, outreach, CRM, or employees.
import { pool } from "@/db";

export async function ensureCareerSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_profile (
      id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      full_name text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      location text NOT NULL DEFAULT '',
      linkedin text NOT NULL DEFAULT '',
      github text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '',
      headline text NOT NULL DEFAULT '',
      summary text NOT NULL DEFAULT '',
      skills jsonb NOT NULL DEFAULT '[]',
      experience jsonb NOT NULL DEFAULT '[]',
      education jsonb NOT NULL DEFAULT '[]',
      certifications jsonb NOT NULL DEFAULT '[]',
      projects jsonb NOT NULL DEFAULT '[]',
      master_resume text NOT NULL DEFAULT '',
      missing_fields jsonb NOT NULL DEFAULT '[]',
      approved_at timestamptz,
      updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_preferences (
      id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      min_monthly_inr integer,
      preferred_ctc_inr integer,
      locations jsonb NOT NULL DEFAULT '[]',
      work_modes jsonb NOT NULL DEFAULT '["remote","hybrid"]',
      employment_types jsonb NOT NULL DEFAULT '["full-time"]',
      notice_period text NOT NULL DEFAULT '',
      joining_availability text NOT NULL DEFAULT '',
      experience_level text NOT NULL DEFAULT 'junior-mid',
      preferred_industries jsonb NOT NULL DEFAULT '[]',
      excluded_companies jsonb NOT NULL DEFAULT '[]',
      include_keywords jsonb NOT NULL DEFAULT '[]',
      exclude_keywords jsonb NOT NULL DEFAULT '[]',
      target_roles jsonb NOT NULL DEFAULT '[]',
      daily_application_target integer NOT NULL DEFAULT 5,
      approval_mode text NOT NULL DEFAULT 'review_first',
      auto_submit boolean NOT NULL DEFAULT false,
      report_email text NOT NULL DEFAULT '',
      weights jsonb NOT NULL DEFAULT '{"skills":30,"projects":25,"seniority":15,"location":10,"compensation":10,"industry":10}',
      updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_jobs (
      id serial PRIMARY KEY,
      source text NOT NULL,
      source_id text NOT NULL,
      canonical_url text NOT NULL DEFAULT '',
      title text NOT NULL DEFAULT '',
      company text NOT NULL DEFAULT '',
      location text NOT NULL DEFAULT '',
      work_mode text NOT NULL DEFAULT '',
      employment_type text NOT NULL DEFAULT '',
      salary_text text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      posted_at timestamptz,
      discovered_at timestamptz DEFAULT now(),
      apply_url text NOT NULL DEFAULT '',
      apply_method text NOT NULL DEFAULT 'manual',
      expired boolean NOT NULL DEFAULT false,
      match_score integer,
      match_breakdown jsonb NOT NULL DEFAULT '{}',
      match_reasons text NOT NULL DEFAULT '',
      concerns text NOT NULL DEFAULT '',
      shortlisted boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'discovered',
      UNIQUE (source, source_id)
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_career_jobs_score ON career_jobs(match_score DESC NULLS LAST)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_career_jobs_status ON career_jobs(status)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_applications (
      id serial PRIMARY KEY,
      job_id integer REFERENCES career_jobs(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'awaiting_approval',
      idempotency_key text UNIQUE,
      submitted_at timestamptz,
      submit_result text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      follow_up_due timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_career_apps_status ON career_applications(status)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_documents (
      id serial PRIMARY KEY,
      job_id integer REFERENCES career_jobs(id) ON DELETE CASCADE,
      application_id integer REFERENCES career_applications(id) ON DELETE SET NULL,
      kind text NOT NULL,
      body text NOT NULL DEFAULT '',
      version integer NOT NULL DEFAULT 1,
      approved boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_search_runs (
      id serial PRIMARY KEY,
      started_at timestamptz DEFAULT now(),
      completed_at timestamptz,
      status text NOT NULL DEFAULT 'running',
      sources jsonb NOT NULL DEFAULT '[]',
      discovered integer NOT NULL DEFAULT 0,
      duplicates integer NOT NULL DEFAULT 0,
      shortlisted integer NOT NULL DEFAULT 0,
      errors text NOT NULL DEFAULT ''
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS career_activity_logs (
      id serial PRIMARY KEY,
      created_at timestamptz DEFAULT now(),
      action text NOT NULL,
      object text NOT NULL DEFAULT '',
      object_id text NOT NULL DEFAULT '',
      detail jsonb NOT NULL DEFAULT '{}'
    )`);
}

export async function careerLog(action: string, object = "", objectId: string | number = "", detail: any = {}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO career_activity_logs (action, object, object_id, detail) VALUES ($1,$2,$3,$4)`,
      [action.slice(0, 80), object.slice(0, 40), String(objectId).slice(0, 60), JSON.stringify(detail).slice(0, 4000)]);
  } catch { /* never break the pipeline */ }
}

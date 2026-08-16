/**
 * Vyravo AI — Proposal Automation setup & seed script.
 *
 * Adds additive columns to the existing `proposals` table, creates the new
 * proposal_* tables, and seeds default proposal templates.
 *
 * Run: npm run proposal:setup  (idempotent)
 */
import { pool } from "../src/db/index";

const PROPOSAL_COLUMNS: { name: string; ddl: string }[] = [
  { name: "client_name", ddl: "TEXT" },
  { name: "company_name", ddl: "TEXT" },
  { name: "client_email", ddl: "TEXT" },
  { name: "client_phone", ddl: "TEXT" },
  { name: "client_website", ddl: "TEXT" },
  { name: "industry", ddl: "TEXT" },
  { name: "secure_token", ddl: "VARCHAR(64)" },
  { name: "project_description", ddl: "TEXT" },
  { name: "business_problems", ddl: "JSONB" },
  { name: "goals", ddl: "JSONB" },
  { name: "requirements", ddl: "JSONB" },
  { name: "selected_services", ddl: "JSONB" },
  { name: "proposal_content", ddl: "JSONB" },
  { name: "payment_terms", ddl: "TEXT" },
  { name: "support_terms", ddl: "TEXT" },
  { name: "expiry_days", ddl: "INTEGER DEFAULT 14" },
  { name: "generated_by_ai", ddl: "BOOLEAN DEFAULT false" },
  { name: "ai_status", ddl: "VARCHAR(30)" },
  { name: "last_activity_at", ddl: "TIMESTAMP" },
  { name: "archived_at", ddl: "TIMESTAMP" },
  { name: "follow_up_stage", ddl: "INTEGER DEFAULT 0" },
  { name: "notes", ddl: "TEXT" },
  { name: "changes_requested_at", ddl: "TIMESTAMP" },
  { name: "total_viewed", ddl: "INTEGER DEFAULT 0" },
];

async function applyMigrations() {
  console.log("Adding additive columns to proposals…");
  for (const col of PROPOSAL_COLUMNS) {
    await pool.query(
      `ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`
    );
  }
  console.log("proposals columns ready ✓");

  console.log("Creating proposal_* tables…");
  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_versions (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    title TEXT,
    content JSONB,
    summary TEXT,
    total DECIMAL(10,2),
    status VARCHAR(50),
    changed_by INTEGER,
    change_note TEXT,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pv_proposal_idx ON proposal_versions(proposal_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_items (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT,
    service_type VARCHAR(50),
    implementation_fee DECIMAL(10,2) DEFAULT 0,
    monthly_recurring DECIMAL(10,2) DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    is_addon BOOLEAN DEFAULT false,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pi_proposal_idx ON proposal_items(proposal_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50),
    content JSONB,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_events (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pe_proposal_idx ON proposal_events(proposal_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pe_type_idx ON proposal_events(event_type)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_comments (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    author TEXT,
    author_type VARCHAR(20),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pc_proposal_idx ON proposal_comments(proposal_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_acceptance (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    decision VARCHAR(20) NOT NULL,
    client_name TEXT,
    client_email TEXT,
    comments TEXT,
    ip_address TEXT,
    user_agent TEXT,
    signature TEXT,
    signed_at TIMESTAMP DEFAULT now() NOT NULL,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pa_proposal_idx ON proposal_acceptance(proposal_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS proposal_payment_milestones (
    id SERIAL PRIMARY KEY,
    proposal_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    percent INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    due_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ppm_proposal_idx ON proposal_payment_milestones(proposal_id)`);

  console.log("proposal_* tables ready ✓");
}

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------
const DEFAULT_TEMPLATES = [
  {
    slug: "ai-automation",
    name: "AI Automation Proposal",
    category: "automation",
    description: "General AI automation proposal covering chatbots, workflow automation, and custom AI.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution", type: "prose" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "implementation", title: "Implementation Process", type: "prose" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "support", title: "Support & Maintenance", type: "prose" },
      { id: "why_vyravo", title: "Why Vyravo AI", type: "prose" },
      { id: "case_studies", title: "Relevant Case Studies", type: "list" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
  {
    slug: "voice-agent",
    name: "AI Voice Agent Proposal",
    category: "voice",
    description: "Focused proposal for an AI Voice Receptionist / Voice Agent deployment.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution — AI Voice Receptionist", type: "prose" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "implementation", title: "Implementation Process", type: "prose" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "support", title: "Support & Maintenance", type: "prose" },
      { id: "why_vyravo", title: "Why Vyravo AI", type: "prose" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
  {
    slug: "crm-automation",
    name: "CRM Automation Proposal",
    category: "crm",
    description: "CRM automation, lead management, and sales pipeline automation proposal.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution — CRM Automation", type: "prose" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "implementation", title: "Implementation Process", type: "prose" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "support", title: "Support & Maintenance", type: "prose" },
      { id: "why_vyravo", title: "Why Vyravo AI", type: "prose" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
  {
    slug: "ai-chatbot",
    name: "AI Chatbot Proposal",
    category: "chatbot",
    description: "Website / omnichannel AI chatbot proposal.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution — AI Chatbot", type: "prose" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "implementation", title: "Implementation Process", type: "prose" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "support", title: "Support & Maintenance", type: "prose" },
      { id: "why_vyravo", title: "Why Vyravo AI", type: "prose" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
  {
    slug: "full-automation",
    name: "Full AI Business Automation Proposal",
    category: "full",
    description: "Comprehensive multi-system AI automation proposal.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution", type: "prose" },
      { id: "recommended_systems", title: "Recommended AI Systems", type: "list" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "implementation", title: "Implementation Process", type: "prose" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "addons", title: "Optional Add-ons", type: "list" },
      { id: "support", title: "Support & Maintenance", type: "prose" },
      { id: "why_vyravo", title: "Why Vyravo AI", type: "prose" },
      { id: "case_studies", title: "Relevant Case Studies", type: "list" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
  {
    slug: "enterprise-custom",
    name: "Custom Enterprise Proposal",
    category: "enterprise",
    description: "Blank enterprise proposal — add sections freely.",
    sections: [
      { id: "cover", title: "Cover", type: "cover" },
      { id: "executive_summary", title: "Executive Summary", type: "prose" },
      { id: "understanding", title: "Understanding of Your Business", type: "prose" },
      { id: "challenges", title: "Current Challenges", type: "prose" },
      { id: "solution", title: "Proposed Solution", type: "prose" },
      { id: "scope", title: "Scope of Work", type: "prose" },
      { id: "deliverables", title: "Deliverables", type: "list" },
      { id: "timeline", title: "Timeline", type: "prose" },
      { id: "investment", title: "Investment", type: "pricing" },
      { id: "terms", title: "Terms & Conditions", type: "prose" },
      { id: "acceptance", title: "Acceptance", type: "acceptance" },
      { id: "contact", title: "Contact", type: "contact" },
    ],
  },
];

async function seedTemplates() {
  for (const t of DEFAULT_TEMPLATES) {
    const exists = await pool.query(`SELECT id FROM proposal_templates WHERE slug = $1`, [t.slug]);
    if ((exists.rowCount ?? 0) > 0) continue;
    await pool.query(
      `INSERT INTO proposal_templates (name, slug, description, category, content, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5::jsonb, true, true)`,
      [t.name, t.slug, t.description, t.category, JSON.stringify({ sections: t.sections })]
    );
    console.log(`  ✓ template: ${t.name}`);
  }
  console.log("Templates seeded ✓");
}

async function main() {
  console.log("\n=== Vyravo AI Proposal Automation Setup ===\n");
  await applyMigrations();
  await seedTemplates();
  console.log("\n=== Setup complete ===\n");
  await pool.end();
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});

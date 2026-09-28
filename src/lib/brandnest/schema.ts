// ============================================================================
// BRANDNEST STUDIO — schema (ADDITIVE ONLY). Unified contact model: every
// person/company is ONE row in `leads`; BrandNest data lives in extension
// tables. Existing Vyravo rows are untouched and read as 'vyravo_ai'.
// ============================================================================
import { pool } from "@/db";

export const BUSINESS_SOURCES = ["vyravo_ai", "brandnest", "brandnest_to_vyravo", "other"] as const;
export type BusinessSource = (typeof BUSINESS_SOURCES)[number];

export const BUSINESS_LABELS: Record<string, string> = {
  vyravo_ai: "Vyravo AI",
  brandnest: "BrandNest Studio",
  brandnest_to_vyravo: "BrandNest → Vyravo",
  other: "Other",
};

export function businessLabel(s: any): string {
  return BUSINESS_LABELS[String(s || "vyravo_ai")] || String(s);
}

/** BrandNest relationship statuses (§3) + pipeline stages (§6). */
export const BRANDNEST_STATUSES = [
  "historical", "reactivation_candidate", "contacted", "reply_received",
  "requirement_identified", "quoted", "active_project", "delivered",
  "payment_pending", "paid", "repeat_client", "inactive", "converted_to_vyravo",
] as const;

export const BRANDNEST_STATUS_LABELS: Record<string, string> = {
  historical: "Historical Client",
  reactivation_candidate: "Reactivation Candidate",
  contacted: "Contacted",
  reply_received: "Reply Received",
  requirement_identified: "Requirement Identified",
  quoted: "Quoted",
  active_project: "Delivered",
  delivered: "Delivered",
  payment_pending: "Payment Pending",
  paid: "Paid",
  repeat_client: "Repeat Client",
  inactive: "Inactive",
  converted_to_vyravo: "Converted to Vyravo",
};

export const PROJECT_STATUSES = ["pending", "partially_paid", "paid", "refunded", "cancelled"] as const;

export const REACTIVATION_STATUSES = ["do_not_contact", "manual_review", "ready", "active"] as const;
export const REACTIVATION_LABELS: Record<string, string> = {
  do_not_contact: "Do Not Contact",
  manual_review: "Manual Review",
  ready: "Ready for Reactivation",
  active: "Reactivation Active",
};

export const VYRAVO_CATEGORIES = [
  "AI Chatbot", "WhatsApp Automation", "CRM Automation", "Lead Qualification",
  "Appointment Automation", "Email Automation", "Customer Support",
  "Internal Workflow Automation", "Voice Receptionist", "Other",
] as const;

export async function ensureBrandNestSchema(): Promise<void> {
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_source text DEFAULT 'vyravo_ai'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business_source)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS brandnest_clients (
      lead_id integer PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
      relationship_status text NOT NULL DEFAULT 'historical',
      acquisition_source text NOT NULL DEFAULT '',
      services jsonb NOT NULL DEFAULT '[]',
      reactivation_status text NOT NULL DEFAULT 'manual_review',
      vyravo_opportunity text NOT NULL DEFAULT 'none',
      vyravo_categories text[] NOT NULL DEFAULT '{}',
      repeat_value numeric,
      notes text NOT NULL DEFAULT '',
      next_follow_up timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bn_clients_rel ON brandnest_clients(relationship_status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bn_clients_react ON brandnest_clients(reactivation_status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bn_clients_opp ON brandnest_clients(vyravo_opportunity)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS brandnest_projects (
      id serial PRIMARY KEY,
      lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      service text NOT NULL DEFAULT '',
      amount numeric NOT NULL DEFAULT 0,
      currency text NOT NULL DEFAULT 'INR',
      status text NOT NULL DEFAULT 'pending',
      created_date timestamptz DEFAULT now(),
      delivery_date timestamptz,
      payment_date timestamptz,
      payment_method text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bn_projects_lead ON brandnest_projects(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bn_projects_status ON brandnest_projects(status)`);

  // Import audit trail (for future real-data imports; never fabricated rows).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brandnest_imports (
      id serial PRIMARY KEY,
      source text NOT NULL DEFAULT '',
      rows_imported integer NOT NULL DEFAULT 0,
      rows_skipped integer NOT NULL DEFAULT 0,
      note text NOT NULL DEFAULT '',
      created_at timestamptz DEFAULT now()
    )`);
}

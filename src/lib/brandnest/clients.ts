// ============================================================================
// BRANDNEST STUDIO — client CRM. Unified contacts: dedupe by email, ONE lead
// row per person/company; BrandNest facts live in brandnest_clients.
// Creating a BrandNest client NEVER queues outreach, NEVER changes the
// Vyravo pipeline, and NEVER sends anything.
// ============================================================================
import { pool } from "@/db";
import { ensureBrandNestSchema } from "./schema";
import { logDecision } from "@/lib/sales/schema";

export interface BrandNestClientInput {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  linkedin?: string | null;
  location?: string | null;
  acquisitionSource?: string | null;
  relationshipStatus?: string | null;
  services?: string[] | null;
  notes?: string | null;
  nextFollowUp?: string | null;
}

/** Find-or-create the unified lead row, then ensure the BrandNest extension. */
export async function upsertBrandNestClient(input: BrandNestClientInput): Promise<{ leadId: number; created: boolean }> {
  await ensureBrandNestSchema();
  if (!input.name?.trim() && !input.email?.trim() && !input.company?.trim())
    throw new Error("client needs at least a name, email or company");

  const email = (input.email || "").toLowerCase().trim() || null;
  let leadId: number | null = null;
  let created = false;
  if (email) {
    const ex = await pool.query(`SELECT id, business_source FROM leads WHERE lower(email) = $1 LIMIT 1`, [email]);
    if ((ex.rowCount ?? 0) > 0) leadId = Number(ex.rows[0].id);
  }
  if (!leadId && input.phone?.trim()) {
    const digits = input.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const ex = await pool.query(`SELECT id FROM leads WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') LIKE '%' || $1 LIMIT 1`, [digits]);
      if ((ex.rowCount ?? 0) > 0) leadId = Number(ex.rows[0].id);
    }
  }
  if (!leadId) {
    const ins = await pool.query(
      `INSERT INTO leads (full_name, email, phone, business_name, business_website, city, stage, status, source, business_source, lead_score, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'new','active','brandnest','brandnest',0,now()) RETURNING id`,
      [
        (input.name || "BrandNest Client").slice(0, 200),
        email,
        (input.phone || "").slice(0, 60) || null,
        (input.company || "").slice(0, 300) || null,
        (input.website || "").slice(0, 300) || null,
        (input.location || "").slice(0, 120) || null,
      ]);
    leadId = Number(ins.rows[0].id);
    created = true;
  } else {
    // Never overwrite newer info with older import data: fill blanks only.
    await pool.query(
      `UPDATE leads SET full_name = CASE WHEN COALESCE(full_name,'') = '' THEN $2 ELSE full_name END,
        business_name = COALESCE(NULLIF(business_name,''), $3),
        business_website = COALESCE(NULLIF(business_website,''), $4),
        city = COALESCE(NULLIF(city,''), $5) WHERE id = $1`,
      [leadId, (input.name || "").slice(0, 200) || "BrandNest Client",
       (input.company || "").slice(0, 300) || null, (input.website || "").slice(0, 300) || null,
       (input.location || "").slice(0, 120) || null]);
  }

  await pool.query(
    `INSERT INTO brandnest_clients (lead_id, relationship_status, acquisition_source, services, notes, next_follow_up)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (lead_id) DO UPDATE SET
       acquisition_source = CASE WHEN brandnest_clients.acquisition_source = '' THEN EXCLUDED.acquisition_source ELSE brandnest_clients.acquisition_source END,
       notes = CASE WHEN EXCLUDED.notes <> '' AND brandnest_clients.notes NOT LIKE '%' || EXCLUDED.notes || '%' AND length(brandnest_clients.notes) < 3000
                    THEN brandnest_clients.notes || E'\\n' || EXCLUDED.notes ELSE brandnest_clients.notes END,
       updated_at = now()`,
    [leadId, (input.relationshipStatus || "historical").slice(0, 40),
     (input.acquisitionSource || "").slice(0, 200),
     JSON.stringify(input.services || []),
     (input.notes || "").slice(0, 2000),
     input.nextFollowUp || null]);

  if (input.linkedin?.trim()) {
    await pool.query(`UPDATE leads SET additional_info = COALESCE(additional_info,'') || $2 WHERE id = $1 AND COALESCE(additional_info,'') NOT LIKE '%LinkedIn:%'`,
      [leadId, `LinkedIn: ${input.linkedin.slice(0, 200)}`]).catch(() => {});
  }
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead',$2,$3,$1,now())`,
    [leadId, created ? "brandnest_created" : "brandnest_linked",
     created ? "BrandNest client record created (no outreach queued)" : "Linked to existing unified contact (BrandNest relationship added)"]).catch(() => {});
  await logDecision({
    lead_id: leadId, trigger_text: "brandnest", action: created ? "brandnest_created" : "brandnest_linked",
    autonomy: "none", reason: `BrandNest client ${created ? "created" : "linked"} — Vyravo pipeline untouched`,
    context: { source: "brandnest" }, result: created ? "created" : "linked",
  });
  return { leadId, created };
}

export interface ClientRow {
  lead_id: number; [k: string]: any;
}

/** One client + aggregates (projects, revenue, last dates) computed live. */
export async function getBrandNestClient(leadId: number): Promise<any | null> {
  await ensureBrandNestSchema();
  const r = await pool.query(
    `SELECT l.*, b.relationship_status, b.acquisition_source, b.services, b.reactivation_status,
            b.vyravo_opportunity, b.vyravo_categories, b.repeat_value, b.notes AS brandnest_notes,
            b.next_follow_up AS brandnest_next_follow_up,
            (SELECT count(*)::int FROM brandnest_projects p WHERE p.lead_id = l.id) AS project_count,
            (SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = l.id) AS total_revenue,
            (SELECT max(payment_date) FROM brandnest_projects p WHERE p.lead_id = l.id AND status = 'paid') AS last_payment_date,
            (SELECT max(created_date) FROM brandnest_projects p WHERE p.lead_id = l.id) AS last_project_date
     FROM leads l JOIN brandnest_clients b ON b.lead_id = l.id WHERE l.id = $1`, [leadId]);
  return r.rows[0] || null;
}

export async function listBrandNestClients(opts: { status?: string; opportunity?: string; reactivation?: string; q?: string; limit?: number } = {}): Promise<any[]> {
  await ensureBrandNestSchema();
  const conds: string[] = [];
  const args: any[] = [];
  if (opts.status) { args.push(opts.status); conds.push(`b.relationship_status = $${args.length}`); }
  if (opts.opportunity) { args.push(opts.opportunity); conds.push(`b.vyravo_opportunity = $${args.length}`); }
  if (opts.reactivation) { args.push(opts.reactivation); conds.push(`b.reactivation_status = $${args.length}`); }
  if (opts.q) {
    args.push(`%${opts.q.slice(0, 80)}%`);
    conds.push(`(l.full_name ILIKE $${args.length} OR l.business_name ILIKE $${args.length} OR l.email ILIKE $${args.length} OR l.phone ILIKE $${args.length})`);
  }
  const r = await pool.query(
    `SELECT l.id, l.full_name, l.business_name, l.email, l.phone, l.city, l.business_source,
            b.relationship_status, b.reactivation_status, b.vyravo_opportunity, b.vyravo_categories,
            (SELECT count(*)::int FROM brandnest_projects p WHERE p.lead_id = l.id) AS project_count,
            (SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = l.id) AS total_revenue,
            (SELECT max(payment_date) FROM brandnest_projects p WHERE p.lead_id = l.id AND status = 'paid') AS last_payment_date
     FROM leads l JOIN brandnest_clients b ON b.lead_id = l.id
     ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
     ORDER BY total_revenue DESC, l.id DESC LIMIT ${Math.min(Math.max(opts.limit || 100, 1), 500)}`, args);
  return r.rows;
}

export async function updateBrandNestClient(leadId: number, patch: {
  relationshipStatus?: string; reactivationStatus?: string; vyravoOpportunity?: string;
  vyravoCategories?: string[]; repeatValue?: number | null; notes?: string; nextFollowUp?: string | null;
  services?: string[];
}): Promise<void> {
  await ensureBrandNestSchema();
  const sets: string[] = [];
  const args: any[] = [leadId];
  const set = (col: string, v: any) => { args.push(v); sets.push(`${col} = $${args.length}`); };
  if (patch.relationshipStatus) set("relationship_status", patch.relationshipStatus.slice(0, 40));
  if (patch.reactivationStatus) set("reactivation_status", patch.reactivationStatus.slice(0, 30));
  if (patch.vyravoOpportunity) set("vyravo_opportunity", patch.vyravoOpportunity.slice(0, 10));
  if (patch.vyravoCategories) set("vyravo_categories", patch.vyravoCategories.slice(0, 10));
  if (patch.repeatValue !== undefined) set("repeat_value", patch.repeatValue);
  if (patch.notes !== undefined) set("notes", String(patch.notes).slice(0, 4000));
  if (patch.nextFollowUp !== undefined) set("next_follow_up", patch.nextFollowUp);
  if (patch.services) set("services", JSON.stringify(patch.services.slice(0, 30)));
  if (!sets.length) return;
  sets.push("updated_at = now()");
  await pool.query(`UPDATE brandnest_clients SET ${sets.join(", ")} WHERE lead_id = $1`, args);
  await logDecision({ lead_id: leadId, trigger_text: "brandnest", action: "brandnest_updated",
    autonomy: "none", reason: `BrandNest record updated: ${Object.keys(patch).join(", ")}`.slice(0, 300), result: "updated" });
}

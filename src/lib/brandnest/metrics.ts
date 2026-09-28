// ============================================================================
// BRANDNEST STUDIO — dashboard metrics + STRICT revenue separation.
// Vyravo revenue (sales_invoices paid) and BrandNest revenue (projects paid)
// are computed independently and NEVER mixed; combined = explicit sum.
// ============================================================================
import { pool } from "@/db";
import { ensureBrandNestSchema } from "./schema";

export async function getBrandNestMetrics(): Promise<any> {
  await ensureBrandNestSchema();
  const one = async (sql: string, args: any[] = []) => {
    try { return (await pool.query(sql, args)).rows[0] || {}; } catch { return {}; }
  };
  const clients = await one(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE relationship_status IN ('active_project','contacted','reply_received','requirement_identified','quoted','payment_pending','paid'))::int AS active,
       count(*) FILTER (WHERE relationship_status = 'inactive')::int AS inactive,
       count(*) FILTER (WHERE relationship_status = 'repeat_client')::int AS repeat_clients,
       count(*) FILTER (WHERE relationship_status = 'converted_to_vyravo')::int AS converted
     FROM brandnest_clients`);
  const rev = await one(
    `SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'),0)::numeric AS total,
       COALESCE(sum(amount) FILTER (WHERE status = 'paid' AND payment_date >= date_trunc('month', now())),0)::numeric AS month,
       COALESCE(sum(amount) FILTER (WHERE status = 'paid' AND payment_date >= date_trunc('year', now())),0)::numeric AS year,
       count(*)::int AS projects,
       COALESCE(avg(amount) FILTER (WHERE status = 'paid'),0)::numeric AS avg_value,
       max(payment_date) FILTER (WHERE status = 'paid') AS last_payment
     FROM brandnest_projects`);
  const repeatPotential = await one(
    `SELECT count(*)::int AS n FROM brandnest_clients b
     WHERE b.repeat_value IS NOT NULL AND b.repeat_value > 0 AND b.relationship_status NOT IN ('inactive','converted_to_vyravo')`);
  const vyravoFit = await one(
    `SELECT count(*)::int AS n FROM brandnest_clients WHERE vyravo_opportunity IN ('medium','high')`);
  const recent = await pool.query(
    `SELECT p.*, l.business_name, l.full_name FROM brandnest_projects p
     LEFT JOIN leads l ON l.id = p.lead_id ORDER BY p.created_date DESC LIMIT 8`).catch(() => ({ rows: [] as any[] }));
  const topOpp = await pool.query(
    `SELECT l.id, l.full_name, l.business_name, l.email, b.vyravo_opportunity, b.vyravo_categories, b.repeat_value,
            (SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric FROM brandnest_projects p WHERE p.lead_id = l.id) AS spent
     FROM leads l JOIN brandnest_clients b ON b.lead_id = l.id
     WHERE b.vyravo_opportunity IN ('medium','high') OR (b.repeat_value IS NOT NULL AND b.repeat_value > 0)
     ORDER BY b.vyravo_opportunity DESC, spent DESC LIMIT 10`).catch(() => ({ rows: [] as any[] }));
  return {
    clients: { total: clients.total || 0, active: clients.active || 0, inactive: clients.inactive || 0,
      repeat: clients.repeat_clients || 0, converted: clients.converted || 0 },
    revenue: { total: Number(rev.total || 0), month: Number(rev.month || 0), year: Number(rev.year || 0),
      projects: rev.projects || 0, avgValue: Number(rev.avg_value || 0), lastPayment: rev.last_payment || null },
    repeatPotential: repeatPotential.n || 0,
    vyravoFit: vyravoFit.n || 0,
    recentProjects: recent.rows,
    topOpportunities: topOpp.rows,
  };
}

/** Separated revenue: vyravo ≠ brandnest, combined explicit. */
export async function getRevenueSplit(): Promise<{ vyravo: number; brandnest: number; combined: number; currency: string }> {
  await ensureBrandNestSchema();
  let vyravo = 0, brandnest = 0;
  try {
    vyravo = Number((await pool.query(
      `SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric v FROM sales_invoices`)).rows[0]?.v || 0);
  } catch {}
  try {
    brandnest = Number((await pool.query(
      `SELECT COALESCE(sum(amount) FILTER (WHERE status='paid'),0)::numeric v FROM brandnest_projects`)).rows[0]?.v || 0);
  } catch {}
  return { vyravo, brandnest, combined: vyravo + brandnest, currency: "INR" };
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/admin/funnel2/leads?country=&city=&industry=&minScore=&status=&hasLinkedin=1&hasEmail=1&source=&limit=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // idempotent DDL so the first admin visit works even before the funnel run
    await pool.query(`CREATE TABLE IF NOT EXISTS funnel2_leads (
      id bigserial PRIMARY KEY, company_name text NOT NULL, industry text, country text, city text,
      website text, domain_norm text, linkedin_company text, decision_maker text, job_title text,
      linkedin_profile text, email text, email_norm text, phone text, lead_source text,
      lead_score int DEFAULT 0, score_reasons jsonb, pain_point text, automation_opportunity text,
      recommended_service text, reason text, contact_confidence int DEFAULT 0, status text DEFAULT 'NEW',
      linkedin_ready boolean DEFAULT false, email_ready boolean DEFAULT false,
      linkedin_opener text, email_opener text, notes text,
      date_discovered date DEFAULT CURRENT_DATE, last_contacted_at timestamptz, follow_up_date date,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())`);

    const sp = request.nextUrl.searchParams;
    const conds: string[] = [];
    const params: any[] = [];
    const add = (sql: string, v: any) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };
    const g = (k: string) => (sp.get(k) || "").trim();
    if (g("country")) add("country = ?", g("country"));
    if (g("city")) add("city = ?", g("city"));
    if (g("industry")) add("industry = ?", g("industry"));
    if (g("status")) add("status = ?", g("status"));
    if (g("source")) add("lead_source ILIKE ?", "%" + g("source") + "%");
    if (g("minScore")) add("lead_score >= ?", Number(g("minScore")));
    if (g("hasLinkedin") === "1") conds.push("linkedin_profile IS NOT NULL");
    if (g("hasEmail") === "1") conds.push("email IS NOT NULL");
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const limit = Math.min(Math.max(Number(g("limit") || "200"), 1), 500);
    params.push(limit);

    const [leads, stats, facets] = await Promise.all([
      pool.query(`SELECT * FROM funnel2_leads ${where} ORDER BY lead_score DESC, id DESC LIMIT $${params.length}`, params),
      pool.query(`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE date_discovered = CURRENT_DATE)::int new_today,
        count(*) FILTER (WHERE lead_score >= 70)::int qualified,
        count(*) FILTER (WHERE status IN ('CONTACTED','REPLIED','INTERESTED','CALL_BOOKED','PROPOSAL_SENT'))::int contacted,
        count(*) FILTER (WHERE status = 'REPLIED')::int replies,
        count(*) FILTER (WHERE status = 'CALL_BOOKED')::int calls_booked,
        count(*) FILTER (WHERE status = 'WON')::int won,
        count(*) FILTER (WHERE status = 'DO_NOT_CONTACT')::int dnc,
        count(*) FILTER (WHERE email IS NOT NULL)::int with_email,
        count(*) FILTER (WHERE linkedin_profile IS NOT NULL)::int with_linkedin
      FROM funnel2_leads`),
      pool.query(`SELECT DISTINCT country, city, industry FROM funnel2_leads ORDER BY 1, 2, 3 LIMIT 500`),
    ]);
    const s: any = stats.rows[0];
    s.conversionRate = s.total ? ((s.won || 0) / s.total * 100).toFixed(1) + "%" : "0%";
    return Response.json({ leads: leads.rows, stats: s, facets: facets.rows });
  } catch (e: any) {
    console.error("funnel2 list error:", e);
    return Response.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

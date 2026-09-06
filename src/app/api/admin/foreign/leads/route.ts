import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureForeignSchema } from "@/lib/foreign/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/foreign/leads
// Filters: type, country, industry, minScore, maxScore, emailStatus,
//          stage, source, from, to, q (name/domain/email search)
// Sort: score | newest | country | industry | verified
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const sp = request.nextUrl.searchParams;
    const conds: string[] = [`l.lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')`];
    const params: any[] = [];
    const push = (sql: string, v: any) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };

    if (sp.get("type")) push(`l.lead_type = ?`, sp.get("type"));
    if (sp.get("country")) push(`lower(l.country) = ?`, String(sp.get("country")).toLowerCase());
    if (sp.get("industry")) push(`l.industry = ?`, sp.get("industry"));
    if (sp.get("minScore")) push(`l.lead_score >= ?`, Number(sp.get("minScore")) || 0);
    if (sp.get("maxScore")) push(`l.lead_score <= ?`, Number(sp.get("maxScore")) || 100);
    if (sp.get("emailStatus")) push(`l.email_verification_status = ?`, String(sp.get("emailStatus")).toUpperCase());
    if (sp.get("stage")) push(`l.stage = ?`, String(sp.get("stage")).toUpperCase());
    if (sp.get("source")) push(`l.source = ?`, sp.get("source"));
    if (sp.get("from")) push(`l.created_at >= ?`, sp.get("from"));
    if (sp.get("to")) push(`l.created_at <= ?`, String(sp.get("to")) + " 23:59:59");
    if (sp.get("q")) {
      const like = `%${String(sp.get("q")).slice(0, 80)}%`;
      const base = params.length;
      conds.push(`(l.business_name ILIKE $${base + 1} OR l.business_website ILIKE $${base + 2} OR l.email ILIKE $${base + 3})`);
      params.push(like, like, like);
    }
    const where = conds.join(" AND ");
    const sortMap: Record<string, string> = {
      score: "l.lead_score DESC, l.id DESC",
      newest: "l.created_at DESC, l.id DESC",
      country: "l.country ASC, l.lead_score DESC",
      industry: "l.industry ASC, l.lead_score DESC",
      verified: "l.email_verification_status DESC NULLS LAST, l.lead_score DESC",
    };
    const orderBy = sortMap[sp.get("sort") || "score"] || sortMap.score;
    const limit = Math.min(Math.max(Number(sp.get("limit") || 100), 1), 500);
    const offset = Math.max(Number(sp.get("offset") || 0), 0);

    const list = await pool.query(
      `SELECT l.id, l.lead_type, l.business_name, l.business_website, l.country, l.city, l.industry,
              l.company_size, l.phone, l.linkedin_url, l.email, l.email_verification_status,
              l.email_verification_source, l.email_verified_at, l.lead_score, l.lead_category,
              l.why_this_lead, l.recommended_offer, l.partnership_angle, l.outreach_drafts,
              l.agency_services, l.white_label_fit, l.first_name, l.last_name, l.job_title,
              l.stage, l.status, l.source, l.created_at, l.last_enriched_at, l.website_ok
       FROM leads l WHERE ${where}
       ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    const count = await pool.query(`SELECT count(*)::int n FROM leads l WHERE ${where}`, params);
    const facets = await pool.query(
      `SELECT DISTINCT country, industry, lead_type, email_verification_status, source
       FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')
       ORDER BY 1, 2 NULLS LAST`
    );
    return Response.json({ leads: list.rows, total: count.rows[0]?.n || 0, facets: facets.rows });
  } catch (e: any) {
    console.error("foreign leads error:", e);
    return Response.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

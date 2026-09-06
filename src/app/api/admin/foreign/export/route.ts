import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureForeignSchema, foreignBucket } from "@/lib/foreign/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/foreign/export?type=&country=&... — CSV (same filters as /leads).
const COLS = ["Lead Type", "Company", "First Name", "Last Name", "Job Title", "Email", "Email Status",
  "Phone", "Website", "LinkedIn", "Country", "City", "Industry", "Company Size", "Lead Score",
  "Lead Rating", "Why This Lead", "Recommended Vyravo Offer", "Lead Source", "Date Discovered", "Outreach Status"];

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const sp = request.nextUrl.searchParams;
    const conds: string[] = [`lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')`];
    const params: any[] = [];
    const push = (sql: string, v: any) => { params.push(v); conds.push(sql.replace("?", `$${params.length}`)); };
    if (sp.get("type")) push(`lead_type = ?`, sp.get("type"));
    if (sp.get("country")) push(`lower(country) = ?`, String(sp.get("country")).toLowerCase());
    if (sp.get("industry")) push(`industry = ?`, sp.get("industry"));
    if (sp.get("minScore")) push(`lead_score >= ?`, Number(sp.get("minScore")) || 0);
    if (sp.get("emailStatus")) push(`email_verification_status = ?`, String(sp.get("emailStatus")).toUpperCase());
    if (sp.get("stage")) push(`stage = ?`, String(sp.get("stage")).toUpperCase());

    const r = await pool.query(
      `SELECT lead_type, business_name, first_name, last_name, job_title, email, email_verification_status,
              phone, business_website, linkedin_url, country, city, industry, company_size,
              lead_score, why_this_lead, recommended_offer, source, created_at, stage
       FROM leads WHERE ${conds.join(" AND ")} ORDER BY lead_score DESC, id DESC LIMIT 2000`,
      params
    );
    const rows = [COLS.join(",")];
    for (const l of r.rows) {
      rows.push([
        l.lead_type === "WHITE_LABEL_AGENCY" ? "WHITE_LABEL_AGENCY" : "FOREIGN_CLIENT",
        csv(l.business_name), csv(l.first_name), csv(l.last_name), csv(l.job_title),
        csv(l.email), csv(l.email_verification_status || "UNKNOWN"), csv(l.phone),
        csv(l.business_website), csv(l.linkedin_url), csv(l.country), csv(l.city), csv(l.industry),
        csv(l.company_size), l.lead_score ?? 0, csv(foreignBucket(l.lead_score ?? 0)),
        csv(l.why_this_lead), csv(l.recommended_offer), csv(l.source),
        csv(l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : ""),
        csv((l.stage || "NEW").replace(/_/g, " ")),
      ].join(","));
    }
    return new Response("\uFEFF" + rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="foreign-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    console.error("foreign export error:", e);
    return Response.json({ error: "Failed to export" }, { status: 500 });
  }
}

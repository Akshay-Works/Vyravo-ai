import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { buildLeadFilters, whereClause } from "@/lib/funnel2/filters";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/admin/funnel2/export?queue=&country=&city=&industry=&status=&minScore=&hasLinkedin=1&hasEmail=1&q=
// Streams ALL matching rows as CSV (same filters as the table → WYSIWYG export).
const COLS = [
  "id", "company_name", "industry", "country", "city", "website",
  "linkedin_company", "decision_maker", "job_title", "linkedin_profile",
  "email", "phone", "lead_score", "status", "queue",
  "linkedin_ready", "email_ready", "recommended_service", "pain_point",
  "automation_opportunity", "reason", "contact_confidence", "lead_source",
  "date_discovered", "notes",
];

function csv(v: any): string {
  if (v === null || v === undefined) return "";
  // pg returns `date` columns as JS Date → format as YYYY-MM-DD
  let s: string;
  if (v instanceof Date) s = v.toISOString().slice(0, 10);
  else s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sp = request.nextUrl.searchParams;
    const f = buildLeadFilters(sp);
    const where = whereClause(f);
    const rows = await pool.query(
      `SELECT * FROM funnel2_leads ${where} ORDER BY lead_score DESC, id DESC LIMIT 2000`,
      f.params
    );

    const lines: string[] = [COLS.join(",")];
    for (const r of rows.rows) {
      const queue = r.linkedin_ready && r.email_ready ? "both"
        : r.linkedin_ready ? "linkedin"
        : r.email_ready ? "email" : "none";
      const vals: any[] = [
        r.id, r.company_name, r.industry, r.country, r.city, r.website,
        r.linkedin_company, r.decision_maker, r.job_title, r.linkedin_profile,
        r.email, r.phone, r.lead_score, r.status, queue,
        r.linkedin_ready, r.email_ready, r.recommended_service, r.pain_point,
        r.automation_opportunity, r.reason, r.contact_confidence, r.lead_source,
        r.date_discovered, r.notes,
      ];
      lines.push(vals.map(csv).join(","));
    }
    const queue = (sp.get("queue") || "all").replace(/[^a-z]/gi, "");
    const date = new Date().toISOString().slice(0, 10);
    const csvText = "\uFEFF" + lines.join("\r\n"); // BOM for Excel
    return new Response(csvText, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="funnel2-${queue}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("funnel2 export error:", e);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}

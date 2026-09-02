// Shared filter builder for the Funnel 2 admin leads list + CSV export.
// Both routes must apply exactly the same filters so "what you see is what
// you export".
import type { URLSearchParams } from "url";

export function buildLeadFilters(sp: URLSearchParams): { conds: string[]; params: any[] } {
  const conds: string[] = [];
  const params: any[] = [];
  const add = (sql: string, v: any) => {
    params.push(v);
    conds.push(sql.replace("?", `$${params.length}`));
  };
  const g = (k: string) => (sp.get(k) || "").trim();

  if (g("country")) add("country = ?", g("country"));
  if (g("city")) add("city = ?", g("city"));
  if (g("industry")) add("industry = ?", g("industry"));
  if (g("status")) add("status = ?", g("status"));
  if (g("source")) add("lead_source ILIKE ?", "%" + g("source") + "%");
  if (g("minScore")) add("lead_score >= ?", Number(g("minScore")));
  if (g("hasLinkedin") === "1") conds.push("linkedin_profile IS NOT NULL");
  if (g("hasEmail") === "1") conds.push("email IS NOT NULL");

  // outreach queue: both / linkedin (ready) / email (ready) / none
  const queue = g("queue");
  if (queue === "both") conds.push("linkedin_ready = true AND email_ready = true");
  else if (queue === "linkedin") conds.push("linkedin_ready = true AND email_ready = false");
  else if (queue === "email") conds.push("email_ready = true AND linkedin_ready = false");
  else if (queue === "none") conds.push("linkedin_ready = false AND email_ready = false");

  // free-text search (matches the dashboard's client-side search box)
  const q = g("q");
  if (q) {
    const like = `%${q}%`;
    params.push(like, like, like, like);
    conds.push(`(company_name ILIKE $${params.length - 3} OR decision_maker ILIKE $${params.length - 2} OR city ILIKE $${params.length - 1} OR email ILIKE $${params.length})`);
  }
  return { conds, params };
}

export function whereClause(f: { conds: string[] }): string {
  return f.conds.length ? "WHERE " + f.conds.join(" AND ") : "";
}

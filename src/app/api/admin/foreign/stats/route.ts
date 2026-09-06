import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureForeignSchema } from "@/lib/foreign/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/foreign/stats — dashboard cards + chart series.
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const [cards, byCountry, byIndustry, bySource, byStage, series, scoreDist, runs] = await Promise.all([
      pool.query(`SELECT
        count(*)::int total,
        count(*) FILTER (WHERE lead_type = 'FOREIGN_CLIENT')::int direct_clients,
        count(*) FILTER (WHERE lead_type = 'WHITE_LABEL_AGENCY')::int agencies,
        count(*) FILTER (WHERE email_verification_status = 'VERIFIED')::int verified_emails,
        count(*) FILTER (WHERE lead_score >= 80)::int hot,
        count(*) FILTER (WHERE lead_score >= 60 AND lead_score < 80)::int high,
        count(*) FILTER (WHERE stage IN ('READY_FOR_OUTREACH','CONTACTED','REPLIED','CALL_BOOKED','PROPOSAL','WON','PARTNERSHIP_CONTACTED','INTERESTED','PARTNERSHIP_CALL','ACTIVE_PARTNER'))::int ready_for_outreach,
        count(*) FILTER (WHERE stage IN ('CONTACTED','REPLIED','CALL_BOOKED','PROPOSAL','WON','PARTNERSHIP_CONTACTED','INTERESTED','PARTNERSHIP_CALL','ACTIVE_PARTNER'))::int contacted,
        count(*) FILTER (WHERE stage IN ('REPLIED','CALL_BOOKED','PROPOSAL','WON'))::int replies,
        count(*) FILTER (WHERE email_verification_status = 'INVALID')::int invalid_emails
      FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')`),
      pool.query(`SELECT country, count(*)::int n FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY') GROUP BY country ORDER BY n DESC LIMIT 15`),
      pool.query(`SELECT industry, count(*)::int n FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY') GROUP BY industry ORDER BY n DESC LIMIT 20`),
      pool.query(`SELECT source, count(*)::int n FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY') GROUP BY source ORDER BY n DESC`),
      pool.query(`SELECT stage, count(*)::int n FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY') GROUP BY stage ORDER BY n DESC`),
      pool.query(`SELECT date_trunc('day', created_at)::date d,
                 count(*) FILTER (WHERE lead_type = 'FOREIGN_CLIENT')::int direct,
                 count(*) FILTER (WHERE lead_type = 'WHITE_LABEL_AGENCY')::int agencies
              FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')
              GROUP BY 1 ORDER BY 1 DESC LIMIT 30`),
      pool.query(`SELECT
        count(*) FILTER (WHERE lead_score >= 80)::int hot,
        count(*) FILTER (WHERE lead_score >= 60 AND lead_score < 80)::int high,
        count(*) FILTER (WHERE lead_score >= 40 AND lead_score < 60)::int medium,
        count(*) FILTER (WHERE lead_score < 40)::int low
      FROM leads WHERE lead_type IN ('FOREIGN_CLIENT','WHITE_LABEL_AGENCY')`),
      pool.query(`SELECT id, trigger, mode, started_at, ended_at, status,
                 leads_discovered, leads_qualified, emails_found, emails_verified,
                 duplicates_removed, leads_saved, leads_merged, failed, errors
              FROM foreign_runs ORDER BY id DESC LIMIT 10`),
    ]);
    return Response.json({
      cards: cards.rows[0],
      byCountry: byCountry.rows,
      byIndustry: byIndustry.rows,
      bySource: bySource.rows,
      byStage: byStage.rows,
      series: series.rows.reverse(),
      scoreDist: scoreDist.rows[0],
      runs: runs.rows,
    });
  } catch (e: any) {
    console.error("foreign stats error:", e);
    return Response.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

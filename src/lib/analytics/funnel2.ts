// ============================================================================
// LEAD-ENGINE ANALYTICS (Funnel 1 engine leads + Funnel 2 LinkedIn/Email)
// Raw SQL over the same Neon pool. Every query is wrapped so a missing table
// (fresh env) degrades to zeros — analytics must never crash the dashboard.
// ============================================================================
import { pool } from "@/db";
import type { DateFilter } from "./engine";

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch (e) { console.error("analytics/funnel2:", e); return fallback; }
};

function dayFilter(filter: DateFilter, column = "date_discovered"): { sql: string; params: any[] } {
  if (!filter || filter.period === "all" || filter.period === undefined) return { sql: "", params: [] };
  const now = new Date();
  let from: Date;
  if (filter.period === "today") from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (filter.period === "yesterday") { from = new Date(now); from.setDate(from.getDate() - 1); from = new Date(from.getFullYear(), from.getMonth(), from.getDate()); }
  else if (filter.period === "7d") from = new Date(now.getTime() - 7 * 86400000);
  else if (filter.period === "month") from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (filter.period === "quarter") from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  else if (filter.period === "year") from = new Date(now.getFullYear(), 0, 1);
  else from = new Date(now.getTime() - 30 * 86400000); // 30d default
  if (filter.from) from = new Date(filter.from);
  return { sql: `${column} >= $1::date`, params: [from.toISOString().slice(0, 10)] };
}

// ---------------------------------------------------------------------------
// FUNNEL 2 — LinkedIn + Email/web discovery pipeline
// ---------------------------------------------------------------------------
export async function getFunnel2Analytics(filter: DateFilter = {}): Promise<any> {
  const keep = dayFilter(filter);

  const stats = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT
         count(*)::int total,
         count(*) FILTER (WHERE date_discovered = CURRENT_DATE)::int new_today,
         count(*) FILTER (WHERE lead_score >= 70)::int qualified,
         count(*) FILTER (WHERE status IN ('CONTACTED','REPLIED','INTERESTED','CALL_BOOKED','PROPOSAL_SENT'))::int contacted,
         count(*) FILTER (WHERE status = 'REPLIED')::int replies,
         count(*) FILTER (WHERE status = 'CALL_BOOKED')::int calls_booked,
         count(*) FILTER (WHERE status = 'WON')::int won,
         count(*) FILTER (WHERE status = 'DO_NOT_CONTACT')::int dnc,
         count(*) FILTER (WHERE linkedin_ready = true AND email_ready = true)::int queue_both,
         count(*) FILTER (WHERE linkedin_ready = true AND email_ready = false)::int queue_linkedin,
         count(*) FILTER (WHERE email_ready = true AND linkedin_ready = false)::int queue_email,
         count(*) FILTER (WHERE linkedin_ready = false AND email_ready = false)::int queue_none,
         round(avg(lead_score) FILTER (WHERE lead_score >= 70))::int avg_qualified_score
       FROM funnel2_leads ${cond}`,
      keep.params
    );
    const s = r.rows[0] || {};
    s.conversionRate = s.total ? ((s.won || 0) / s.total * 100).toFixed(1) + "%" : "0%";
    return s;
  }, {});

  const queues = await safe(async () => {
    const r = await pool.query(
      `SELECT
         count(*) FILTER (WHERE linkedin_ready AND email_ready)::int both_ch,
         count(*) FILTER (WHERE linkedin_ready AND NOT email_ready)::int linkedin_only,
         count(*) FILTER (WHERE NOT linkedin_ready AND email_ready)::int email_only,
         count(*) FILTER (WHERE NOT linkedin_ready AND NOT email_ready)::int none
       FROM funnel2_leads`
    );
    const q = r.rows[0];
    return [
      { name: "Both", value: q.both_ch || 0 },
      { name: "LinkedIn", value: q.linkedin_only || 0 },
      { name: "Email", value: q.email_only || 0 },
      { name: "No channel", value: q.none || 0 },
    ];
  }, []);

  const industries = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT coalesce(industry,'unknown') name, count(*)::int count FROM funnel2_leads ${cond} GROUP BY 1 ORDER BY count DESC LIMIT 10`,
      keep.params
    );
    return r.rows;
  }, []);

  const byDay = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT date_discovered::text date,
         count(*)::int discovered,
         count(*) FILTER (WHERE lead_score >= 70)::int qualified
       FROM funnel2_leads ${cond} GROUP BY 1 ORDER BY 1 DESC LIMIT 30`,
      keep.params
    );
    return r.rows.reverse();
  }, []);

  const runs = await safe(async () => {
    const r = await pool.query(
      `SELECT id, started_at, runtime_sec, status, candidates, qualified, inserted, duplicates, invalid
       FROM funnel2_runs ORDER BY id DESC LIMIT 15`
    );
    return r.rows;
  }, []);

  const top = await safe(async () => {
    const r = await pool.query(
      `SELECT id, company_name, industry, city, country, lead_score, status,
         (linkedin_ready AND email_ready) as both_ch, linkedin_ready, email_ready,
         recommended_service, decision_maker
       FROM funnel2_leads ORDER BY lead_score DESC, id DESC LIMIT 10`
    );
    return r.rows;
  }, []);

  return { stats, queues, industries, byDay, runs, top };
}

// ---------------------------------------------------------------------------
// FUNNEL 1 — engine leads (the `leads` table fed by the daily OSM engine)
// ---------------------------------------------------------------------------
export async function getEngineLeadsAnalytics(filter: DateFilter = {}): Promise<any> {
  const keep = dayFilter(filter, "created_at");

  const stats = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT
         count(*)::int total,
         count(*) FILTER (WHERE lead_score >= 90)::int hot,
         count(*) FILTER (WHERE lead_score BETWEEN 75 AND 89)::int high,
         count(*) FILTER (WHERE lead_score BETWEEN 60 AND 74)::int qualified,
         count(*) FILTER (WHERE stage IN ('contacted','replied','interested','call booked','proposal sent','won'))::int worked,
         count(*) FILTER (WHERE stage = 'won')::int won,
         coalesce(round(avg(lead_score)), 0)::int avg_score
       FROM leads ${cond}`,
      keep.params
    );
    return r.rows[0] || {};
  }, {});

  const sources = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT coalesce(source,'unknown') name, count(*)::int count FROM leads ${cond} GROUP BY 1 ORDER BY count DESC LIMIT 8`,
      keep.params
    );
    return r.rows;
  }, []);

  const byDay = await safe(async () => {
    const cond = keep.sql ? "WHERE " + keep.sql : "";
    const r = await pool.query(
      `SELECT created_at::date::text date, count(*)::int count
       FROM leads ${cond} GROUP BY 1 ORDER BY 1 DESC LIMIT 14`,
      keep.params
    );
    return r.rows.reverse();
  }, []);

  return { stats, sources, byDay };
}

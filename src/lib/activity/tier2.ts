// ============================================================================
// TIER 2 analytics — same source of truth as Tier 1 (existing tables only,
// Asia/Kolkata day boundaries, read-only). Every rate is sample-gated:
// denominators below threshold return null and the UI shows "—".
// Cohorts = leads CREATED in range (outcomes counted whenever they occurred);
// archived leads are excluded throughout (footnote in UI).
// ============================================================================
import { pool } from "@/db";
import { ACTIVITY_TZ, countsByDay, rangeBounds, todayIst, type FunnelRange } from "./events";
import { normalizeReplyText, REPLY_CLASS_LABELS, type ReplyClass } from "./classify";

export type Tier2Filters = {
  from?: string; to?: string; // IST YYYY-MM-DD (cohort creation / activity window)
  industry?: string; source?: string; country?: string; priority?: string;
};

const NOT_ARCHIVED = `COALESCE(l.status,'') <> 'archived'`;
const POSITIVE = `l.reply_class IN ('positive','interested_followup')`;

/** Gated rate: null when the denominator is too small to mean anything. */
export function rate(n: number, d: number, minD: number): number | null {
  if (d < minD) return null;
  return Math.round((n / d) * 1000) / 10;
}

function bounds(f: Tier2Filters): [string, string] {
  if (f.from || f.to) {
    const t = todayIst();
    return [`${f.from || t}T00:00:00+05:30`, `${f.to || f.from || t}T00:00:00+05:30`];
  }
  // default: last 30 IST days
  const t = todayIst();
  const d = new Date(t + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 29);
  return [`${d.toISOString().slice(0, 10)}T00:00:00+05:30`, `${t}T00:00:00+05:30`];
}
// end-exclusive bound helper (to-day inclusive → +1 day at 00:00)
function endExcl(isoStartOfToDay: string): string {
  const d = new Date(isoStartOfToDay);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Lead-dimension filter fragment (alias l) + appended params. */
function leadDims(f: Tier2Filters, startIdx: number): { sql: string; params: any[] } {
  const conds: string[] = [];
  const params: any[] = [];
  if (f.industry) { params.push(f.industry); conds.push(`l.industry = $${startIdx + params.length - 1}`); }
  if (f.source) { params.push(f.source); conds.push(`l.source = $${startIdx + params.length - 1}`); }
  if (f.country) { params.push(f.country); conds.push(`l.country = $${startIdx + params.length - 1}`); }
  if (f.priority !== undefined && f.priority !== "") {
    params.push(Number(f.priority)); conds.push(`COALESCE(l.contact_priority, -1) = $${startIdx + params.length - 1}`);
  }
  return { sql: conds.length ? " AND " + conds.join(" AND ") : "", params };
}

export function filterSummary(f: Tier2Filters): string {
  const parts: string[] = [];
  if (f.from || f.to) parts.push(`${f.from || "…"} → ${f.to || "…"}`);
  if (f.industry) parts.push(f.industry);
  if (f.source) parts.push(f.source);
  if (f.country) parts.push(f.country);
  if (f.priority !== undefined && f.priority !== "") parts.push(`P${f.priority}`);
  return parts.join(" · ") || "All leads";
}

// ------------------------------------------------------------------ REPLIES
export async function replyIntelligence(f: Tier2Filters) {
  const [s, e0] = bounds(f);
  const e = endExcl(e0);
  const { sql: dim, params: dp } = leadDims(f, 3);
  // activity in window
  const act = await pool.query(
    `SELECT COUNT(DISTINCT l.id)::int n FROM leads l
     WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim}`, [s, e, ...dp]);
  const byClass = await pool.query(
    `SELECT COALESCE(l.reply_class,'unknown') c, COUNT(*)::int n FROM leads l
     WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim} GROUP BY 1`, [s, e, ...dp]);
  // cohort: contacted in window → replied any time after
  const cohort = await pool.query(
    `SELECT COUNT(DISTINCT e.lead_id)::int contacted,
            COUNT(DISTINCT CASE WHEN l.reply_received THEN e.lead_id END)::int replied,
            COUNT(DISTINCT CASE WHEN ${POSITIVE} THEN e.lead_id END)::int positive
     FROM outreach_events e JOIN leads l ON l.id = e.lead_id
     WHERE ${NOT_ARCHIVED} AND e.follow_up_number = 0 AND e.status = 'sent' AND e.test_send = false
       AND e.sent_at >= $1 AND e.sent_at < $2${dim}`, [s, e, ...dp]);
  const c = cohort.rows[0];
  // per-day replies + positives in window
  const perDay = await pool.query(
    `SELECT (l.replied_at AT TIME ZONE '${ACTIVITY_TZ}')::date d,
            COUNT(*)::int replies,
            COUNT(CASE WHEN ${POSITIVE} THEN 1 END)::int positive
     FROM leads l WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim}
     GROUP BY 1 ORDER BY 1`, [s, e, ...dp]);
  const byDim = async (col: string) => (await pool.query(
    `SELECT COALESCE(NULLIF(l.${col},''),'(blank)') seg, COUNT(*)::int replies,
            COUNT(CASE WHEN ${POSITIVE} THEN 1 END)::int positive
     FROM leads l WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim}
     GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, [s, e, ...dp])).rows;
  // sequence attribution: the latest email sent BEFORE each reply
  const attr = await pool.query(
    `SELECT COALESCE((SELECT e2.follow_up_number FROM outreach_events e2
       WHERE e2.lead_id = l.id AND e2.status = 'sent' AND e2.test_send = false AND e2.sent_at < l.replied_at
       ORDER BY e2.sent_at DESC LIMIT 1), -1)::int step, COUNT(*)::int n
     FROM leads l WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim}
     GROUP BY 1 ORDER BY 1`, [s, e, ...dp]);
  const recent = await pool.query(
    `SELECT l.id, l.business_name, l.email, l.industry, l.source, l.reply_class,
            l.latest_reply_subject, l.latest_reply_preview, l.replied_at, l.follow_up_count
     FROM leads l WHERE ${NOT_ARCHIVED} AND l.reply_received = true AND l.replied_at >= $1 AND l.replied_at < $2${dim}
     ORDER BY l.replied_at DESC LIMIT 30`, [s, e, ...dp]);
  return {
    tz: ACTIVITY_TZ, filter: filterSummary(f),
    activityReplies: act.rows[0]?.n ?? 0,
    cohort: {
      contacted: c.contacted, replied: c.replied, positive: c.positive,
      reply_rate: rate(c.replied, c.contacted, 20),
      positive_rate: rate(c.positive, c.replied, 3),
    },
    byClass: byClass.rows.map((x: any) => ({ class: x.c as ReplyClass, label: REPLY_CLASS_LABELS[x.c as ReplyClass] || x.c, n: x.n })),
    perDay: perDay.rows.map((x: any) => ({ date: new Date(x.d).toISOString().slice(0, 10), replies: x.replies, positive: x.positive })),
    byIndustry: await byDim("industry"),
    bySource: await byDim("source"),
    attribution: attr.rows.map((x: any) => ({ step: x.step, label: x.step < 0 ? "no prior send" : x.step === 0 ? "Intro" : `FU${x.step}`, n: x.n })),
    recent: recent.rows.map((x: any) => ({
      ...x,
      text: normalizeReplyText(x.latest_reply_subject, x.latest_reply_preview).slice(0, 280),
      label: REPLY_CLASS_LABELS[x.reply_class as ReplyClass] || "Unknown",
    })),
  };
}

// ----------------------------------------------------------------- SEGMENTS
export type SegmentRow = {
  seg: string; leads: number; contacted: number; replies: number; positive: number;
  meetings: number; proposals: number; won: number;
  reply_rate: number | null; positive_rate: number | null; meeting_rate: number | null; win_rate: number | null;
};

async function segmentDim(col: string, label: (v: string) => string, f: Tier2Filters, isNumeric = false): Promise<SegmentRow[]> {
  const [s, e0] = bounds(f);
  const e = endExcl(e0);
  const { sql: dim, params: dp } = leadDims(f, 3);
  // numeric cols (contact_priority) can't NULLIF against '' — cast instead
  const segExpr = isNumeric ? `COALESCE(l.${col}::text,'(blank)')` : `COALESCE(NULLIF(l.${col},''),'(blank)')`;
  const r = await pool.query(
    `SELECT ${segExpr} seg,
            COUNT(*)::int leads,
            COUNT(DISTINCT e0.lead_id)::int contacted,
            COUNT(DISTINCT CASE WHEN l.reply_received THEN l.id END)::int replied,
            COUNT(DISTINCT CASE WHEN ${POSITIVE} THEN l.id END)::int positive,
            COUNT(DISTINCT m.lead_id)::int meetings,
            COUNT(DISTINCT p.lead_id)::int proposals,
            COUNT(DISTINCT CASE WHEN p.accepted_at IS NOT NULL THEN p.lead_id END)::int won
     FROM leads l
     LEFT JOIN outreach_events e0 ON e0.lead_id = l.id AND e0.follow_up_number = 0 AND e0.status = 'sent' AND e0.test_send = false
     LEFT JOIN meetings m ON m.lead_id = l.id
     LEFT JOIN proposals p ON p.lead_id = l.id
     WHERE ${NOT_ARCHIVED} AND l.created_at >= $1 AND l.created_at < $2${dim}
     GROUP BY 1 ORDER BY 2 DESC LIMIT 25`, [s, e, ...dp]);
  return r.rows.map((x: any) => ({
    seg: label(String(x.seg)), leads: x.leads, contacted: x.contacted, replies: x.replied,
    positive: x.positive, meetings: x.meetings, proposals: x.proposals, won: x.won,
    reply_rate: rate(x.replied, x.contacted, 10),
    positive_rate: rate(x.positive, x.replied, 3),
    meeting_rate: rate(x.meetings, x.replied, 3),
    win_rate: rate(x.won, x.proposals, 3),
  }));
}

const PRI_LABEL = (v: string) => ({ "1": "P1", "2": "P2", "3": "P3", "4": "P4", "0": "Unranked", "(blank)": "Unranked" } as any)[v] || `P${v}`;

export async function segments(f: Tier2Filters) {
  const [industry, source, country, priority] = await Promise.all([
    segmentDim("industry", (v) => v, f),
    segmentDim("source", (v) => v, f),
    segmentDim("country", (v) => v, f),
    segmentDim("contact_priority", PRI_LABEL, f, true),
  ]);
  // filter dropdown options (global, unfiltered)
  const opts = async (col: string, tbl = "leads") =>
    (await pool.query(`SELECT DISTINCT ${col} v FROM ${tbl} WHERE ${col} IS NOT NULL AND ${col} <> '' ORDER BY 1 LIMIT 60`)).rows.map((x: any) => String(x.v));
  return {
    tz: ACTIVITY_TZ, filter: filterSummary(f),
    note: "Creation cohort (outcomes counted whenever they occurred). Archived leads excluded. Meetings/proposals/won are lead-attributed only.",
    industry, source, country, priority,
    options: {
      industry: await opts("industry"), source: await opts("source"),
      country: await opts("country"),
      priority: ["1", "2", "3", "4"],
    },
  };
}

// ----------------------------------------------------------------- REVENUE
const REAL_CLIENT = `c.status = 'active' AND c.company_name NOT ILIKE '%demo%' AND c.company_name NOT ILIKE '%test%'`;
export const MRR_TARGET = 100000; // ₹1,00,000/month business target

export async function revenue() {
  const t = todayIst();
  const monthStart = `${t.slice(0, 7)}-01T00:00:00+05:30`;
  const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows[0] || {};
  const mrr = await q(`SELECT COALESCE(SUM(c.monthly_recurring),0)::float mrr, COUNT(*)::int n FROM clients c WHERE ${REAL_CLIENT}`);
  const newMrr = await q(`SELECT COALESCE(SUM(c.monthly_recurring),0)::float m FROM clients c WHERE ${REAL_CLIENT} AND c.created_at >= $1`, [monthStart]);
  const life = await q(`SELECT COALESCE(SUM(c.lifetime_value),0)::float v FROM clients c WHERE ${REAL_CLIENT}`);
  const props = await q(`SELECT COUNT(*)::int total,
      COUNT(CASE WHEN p.sent_at IS NOT NULL THEN 1 END)::int sent,
      COUNT(CASE WHEN p.accepted_at IS NULL AND p.rejected_at IS NULL THEN 1 END)::int open,
      COALESCE(SUM(CASE WHEN p.accepted_at IS NULL AND p.rejected_at IS NULL THEN p.total END),0)::float open_value,
      COALESCE(SUM(CASE WHEN p.accepted_at IS NOT NULL THEN p.total END),0)::float won_value,
      COUNT(CASE WHEN p.accepted_at IS NOT NULL THEN 1 END)::int won,
      COALESCE(SUM(CASE WHEN p.rejected_at IS NOT NULL THEN p.total END),0)::float lost_value
    FROM proposals p`);
  const inv = await q(`SELECT COALESCE(SUM(amount_paid),0)::float paid, COALESCE(SUM(amount_due),0)::float due FROM invoices WHERE paid_at IS NOT NULL OR status = 'paid'`);
  const opps = await pool.query(
    `SELECT l.id, l.business_name, l.email,
            CASE WHEN p.lead_id IS NOT NULL THEN 'proposal' WHEN m.lead_id IS NOT NULL THEN 'meeting' ELSE 'replied' END stage,
            (SELECT MAX(p2.total) FROM proposals p2 WHERE p2.lead_id = l.id AND p2.accepted_at IS NULL AND p2.rejected_at IS NULL)::float potential,
            GREATEST(l.replied_at, (SELECT MAX(p2.created_at) FROM proposals p2 WHERE p2.lead_id = l.id)) last_activity
     FROM leads l
     LEFT JOIN (SELECT DISTINCT lead_id FROM meetings WHERE lead_id IS NOT NULL) m ON m.lead_id = l.id
     LEFT JOIN (SELECT DISTINCT lead_id FROM proposals WHERE lead_id IS NOT NULL) p ON p.lead_id = l.id
     WHERE ${NOT_ARCHIVED} AND (l.reply_received = true OR m.lead_id IS NOT NULL OR p.lead_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM proposals pw WHERE pw.lead_id = l.id AND pw.accepted_at IS NOT NULL)
     ORDER BY last_activity DESC NULLS LAST LIMIT 10`);
  const oppCount = await q(`SELECT COUNT(*)::int n FROM leads l
     LEFT JOIN (SELECT DISTINCT lead_id FROM meetings WHERE lead_id IS NOT NULL) m ON m.lead_id = l.id
     LEFT JOIN (SELECT DISTINCT lead_id FROM proposals WHERE lead_id IS NOT NULL) p ON p.lead_id = l.id
     WHERE ${NOT_ARCHIVED} AND (l.reply_received = true OR m.lead_id IS NOT NULL OR p.lead_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM proposals pw WHERE pw.lead_id = l.id AND pw.accepted_at IS NOT NULL)`);
  const unlinked = await q(`SELECT (SELECT COUNT(*)::int FROM meetings WHERE lead_id IS NULL) meetings,
     (SELECT COUNT(*)::int FROM proposals WHERE lead_id IS NULL) proposals`);
  return {
    tz: ACTIVITY_TZ, target: MRR_TARGET, currencyNote: "Target in INR. Stored values shown as recorded.",
    actual: { mrr: mrr.mrr || 0, newMrrMonth: newMrr.m || 0, lifetime: life.v || 0, invoicesPaid: inv.paid || 0, clients: mrr.n || 0 },
    pipeline: {
      openValue: props.open_value || 0, openProposals: props.open || 0,
      proposals: props.total || 0, sent: props.sent || 0,
      opportunities: oppCount.n || 0, list: opps.rows,
    },
    won: { revenue: props.won_value || 0, deals: props.won || 0 },
    lost: { revenue: props.lost_value || 0 },
    unlinked,
    progress: mrr.mrr > 0 ? Math.min(100, Math.round((mrr.mrr / MRR_TARGET) * 1000) / 10) : 0,
  };
}

// ------------------------------------------------------------------ TRENDS
export type TrendRange = FunnelRange | "prev-month";
export async function trends(range: TrendRange, from?: string, to?: string, f: Tier2Filters = {}) {
  const t = todayIst();
  let s: string, e0: string, ps: string, pe0: string;
  if (range === "prev-month") {
    const d = new Date(t + "T00:00:00Z");
    const firstThis = `${t.slice(0, 7)}-01`;
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    const firstPrev = d.toISOString().slice(0, 10);
    s = `${firstPrev}T00:00:00+05:30`; e0 = `${firstThis}T00:00:00+05:30`;
    const d2 = new Date(firstPrev + "T00:00:00Z"); d2.setUTCMonth(d2.getUTCMonth() - 1);
    ps = `${d2.toISOString().slice(0, 10)}T00:00:00+05:30`; pe0 = `${firstPrev}T00:00:00+05:30`;
  } else {
    [s, e0] = rangeBounds(range as FunnelRange, from, to);
    const lenMs = new Date(e0).getTime() - new Date(s).getTime();
    pe0 = s; ps = new Date(new Date(s).getTime() - lenMs).toISOString();
  }
  const e = endExcl(e0), pe = endExcl(pe0);
  const { sql: dim, params: dp } = leadDims(f, 3);
  // lead-scoped daily series (filters apply); proposals/revenue are global
  const series = await pool.query(
    `SELECT d, metric, SUM(n)::int n FROM (
       SELECT (l.created_at AT TIME ZONE '${ACTIVITY_TZ}')::date d, 'leads' metric, COUNT(*) n FROM leads l
       WHERE ${NOT_ARCHIVED} AND l.created_at >= $1 AND l.created_at < $2${dim} GROUP BY 1
       UNION ALL
       SELECT (e.sent_at AT TIME ZONE '${ACTIVITY_TZ}')::date, 'outreach', COUNT(*) FROM outreach_events e JOIN leads l ON l.id = e.lead_id
       WHERE ${NOT_ARCHIVED} AND e.follow_up_number = 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim} GROUP BY 1
       UNION ALL
       SELECT (e.sent_at AT TIME ZONE '${ACTIVITY_TZ}')::date, 'followups', COUNT(*) FROM outreach_events e JOIN leads l ON l.id = e.lead_id
       WHERE ${NOT_ARCHIVED} AND e.follow_up_number > 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim} GROUP BY 1
       UNION ALL
       SELECT (l.replied_at AT TIME ZONE '${ACTIVITY_TZ}')::date, 'replies', COUNT(*) FROM leads l
       WHERE ${NOT_ARCHIVED} AND l.reply_received AND l.replied_at >= $1 AND l.replied_at < $2${dim} GROUP BY 1
       UNION ALL
       SELECT (l.replied_at AT TIME ZONE '${ACTIVITY_TZ}')::date, 'positive', COUNT(*) FROM leads l
       WHERE ${NOT_ARCHIVED} AND ${POSITIVE} AND l.replied_at >= $1 AND l.replied_at < $2${dim} GROUP BY 1
       UNION ALL
       SELECT (m.created_at AT TIME ZONE '${ACTIVITY_TZ}')::date, 'meetings', COUNT(*) FROM meetings m
       LEFT JOIN leads l ON l.id = m.lead_id
       WHERE (m.lead_id IS NULL OR (${NOT_ARCHIVED}${dim})) AND m.created_at >= $1 AND m.created_at < $2 GROUP BY 1
     ) s GROUP BY 1, 2 ORDER BY 1`, [s, e, ...dp]);
  const prop = await pool.query(
    `SELECT (p.sent_at AT TIME ZONE '${ACTIVITY_TZ}')::date d, COUNT(*)::int n FROM proposals p
     WHERE p.sent_at >= $1 AND p.sent_at < $2 GROUP BY 1`, [s, e]);
  const won = await pool.query(
    `SELECT (p.accepted_at AT TIME ZONE '${ACTIVITY_TZ}')::date d, COUNT(*)::int n, COALESCE(SUM(p.total),0)::float v FROM proposals p
     WHERE p.accepted_at >= $1 AND p.accepted_at < $2 GROUP BY 1`, [s, e]);
  const days: Record<string, any> = {};
  const put = (d: string, k: string, v: number) => { days[d] = days[d] || {}; days[d][k] = v; };
  for (const r of series.rows) put(new Date(r.d).toISOString().slice(0, 10), r.metric, r.n);
  for (const r of prop.rows) put(new Date(r.d).toISOString().slice(0, 10), "proposals", r.n);
  for (const r of won.rows) { put(new Date(r.d).toISOString().slice(0, 10), "won", r.n); put(new Date(r.d).toISOString().slice(0, 10), "wonValue", r.v); }
  const keys = ["leads", "outreach", "followups", "replies", "positive", "meetings", "proposals", "won", "wonValue"];
  const list = Object.entries(days).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => {
    const row: any = { date };
    for (const k of keys) row[k] = v[k] ?? 0;
    return row;
  });
  // previous equivalent period totals (same queries, prev window)
  const prevTotals: any = {};
  const prevQ = async (key: string, sql: string) => { prevTotals[key] = ((await pool.query(sql, [ps, pe, ...dp])).rows[0]?.n ?? 0); };
  await prevQ("leads", `SELECT COUNT(*)::int n FROM leads l WHERE ${NOT_ARCHIVED} AND l.created_at >= $1 AND l.created_at < $2${dim}`);
  await prevQ("outreach", `SELECT COUNT(*)::int n FROM outreach_events e JOIN leads l ON l.id = e.lead_id WHERE ${NOT_ARCHIVED} AND e.follow_up_number = 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim}`);
  await prevQ("followups", `SELECT COUNT(*)::int n FROM outreach_events e JOIN leads l ON l.id = e.lead_id WHERE ${NOT_ARCHIVED} AND e.follow_up_number > 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim}`);
  await prevQ("replies", `SELECT COUNT(*)::int n FROM leads l WHERE ${NOT_ARCHIVED} AND l.reply_received AND l.replied_at >= $1 AND l.replied_at < $2${dim}`);
  await prevQ("positive", `SELECT COUNT(*)::int n FROM leads l WHERE ${NOT_ARCHIVED} AND ${POSITIVE} AND l.replied_at >= $1 AND l.replied_at < $2${dim}`);
  const totals: any = {};
  for (const k of keys) totals[k] = list.reduce((a, r) => a + (r[k] || 0), 0);
  const compare: any = {};
  for (const k of ["leads", "outreach", "followups", "replies", "positive"]) {
    const p = prevTotals[k] ?? 0, c = totals[k] ?? 0;
    compare[k] = { current: c, previous: p, change: p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null };
  }
  return { tz: ACTIVITY_TZ, range, from: s.slice(0, 10), to: e0.slice(0, 10), filter: filterSummary({ ...f, from: undefined, to: undefined }), days: list, totals, compare };
}

// ------------------------------------------------------------------- BEST
export async function bestOutreach(f: Tier2Filters) {
  const [s, e0] = bounds(f);
  const e = endExcl(e0);
  const { sql: dim, params: dp } = leadDims(f, 3);
  // by sequence step (replies attributed to the latest email before the reply)
  const steps = await pool.query(
    `SELECT e.follow_up_number step, COUNT(*)::int sent,
            COUNT(DISTINCT CASE WHEN l.reply_received AND l.replied_at > e.sent_at
              AND NOT EXISTS (SELECT 1 FROM outreach_events e3 WHERE e3.lead_id = l.id AND e3.status = 'sent' AND e3.test_send = false AND e3.sent_at > e.sent_at AND e3.sent_at < l.replied_at)
              THEN l.id END)::int replies,
            COUNT(DISTINCT CASE WHEN ${POSITIVE} AND l.replied_at > e.sent_at
              AND NOT EXISTS (SELECT 1 FROM outreach_events e3 WHERE e3.lead_id = l.id AND e3.status = 'sent' AND e3.test_send = false AND e3.sent_at > e.sent_at AND e3.sent_at < l.replied_at)
              THEN l.id END)::int positive
     FROM outreach_events e JOIN leads l ON l.id = e.lead_id
     WHERE ${NOT_ARCHIVED} AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim}
     GROUP BY 1 ORDER BY 1`, [s, e, ...dp]);
  const byHour = await pool.query(
    `SELECT EXTRACT(HOUR FROM e.sent_at AT TIME ZONE '${ACTIVITY_TZ}')::int h, COUNT(*)::int sent,
            COUNT(DISTINCT CASE WHEN l.reply_received AND l.replied_at > e.sent_at THEN l.id END)::int replied_leads
     FROM outreach_events e JOIN leads l ON l.id = e.lead_id
     WHERE ${NOT_ARCHIVED} AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim}
     GROUP BY 1 ORDER BY 1`, [s, e, ...dp]);
  const byDow = await pool.query(
    `SELECT EXTRACT(DOW FROM e.sent_at AT TIME ZONE '${ACTIVITY_TZ}')::int dow, COUNT(*)::int sent,
            COUNT(DISTINCT CASE WHEN l.reply_received AND l.replied_at > e.sent_at THEN l.id END)::int replied_leads
     FROM outreach_events e JOIN leads l ON l.id = e.lead_id
     WHERE ${NOT_ARCHIVED} AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2${dim}
     GROUP BY 1 ORDER BY 1`, [s, e, ...dp]);
  const seg = await segments(f);
  const pick = (rows: SegmentRow[]) => rows.slice(0, 12).map((x) => ({
    seg: x.seg, contacted: x.contacted, replies: x.replies, positive: x.positive,
    reply_rate: x.reply_rate, positive_rate: x.positive_rate,
  }));
  const subjects = await pool.query(
    `SELECT l.business_name, l.reply_class, e.follow_up_number step, e.subject, l.replied_at
     FROM leads l JOIN outreach_events e ON e.lead_id = l.id AND e.status = 'sent' AND e.test_send = false
     WHERE ${NOT_ARCHIVED} AND l.reply_received AND l.replied_at >= $1 AND l.replied_at < $2${dim}
       AND e.sent_at = (SELECT MAX(e2.sent_at) FROM outreach_events e2 WHERE e2.lead_id = l.id AND e2.status = 'sent' AND e2.test_send = false AND e2.sent_at < l.replied_at)
     ORDER BY l.replied_at DESC LIMIT 20`, [s, e, ...dp]);
  return {
    tz: ACTIVITY_TZ, filter: filterSummary(f),
    steps: steps.rows.map((x: any) => ({
      step: x.step, label: x.step === 0 ? "Initial email" : `Follow-up ${x.step}`,
      sent: x.sent, replies: x.replies, positive: x.positive,
      reply_rate: rate(x.replies, x.sent, 20), positive_rate: rate(x.positive, x.replies, 3),
    })),
    byHour: byHour.rows.map((x: any) => ({ hour: x.h, sent: x.sent, replied_leads: x.replied_leads, reply_rate: rate(x.replied_leads, x.sent, 20) })),
    byDow: byDow.rows.map((x: any) => ({ dow: x.dow, sent: x.sent, replied_leads: x.replied_leads, reply_rate: rate(x.replied_leads, x.sent, 20) })),
    byIndustry: pick(seg.industry), bySource: pick(seg.source), byPriority: pick(seg.priority),
    subjects: subjects.rows.map((x: any) => ({ ...x, label: REPLY_CLASS_LABELS[x.reply_class as ReplyClass] || "Unknown" })),
  };
}

// ---------------------------------------------------------------- INSIGHTS
export type Insight = { level: "good" | "warn" | "info"; text: string; metric: string; period: string };

export async function insights(): Promise<{ generated_at: string; period: string; insights: Insight[] }> {
  const out: Insight[] = [];
  const t = todayIst();
  const d30 = new Date(t + "T00:00:00Z"); d30.setUTCDate(d30.getUTCDate() - 29);
  const f30: Tier2Filters = { from: d30.toISOString().slice(0, 10), to: t };
  const [seg, best, rep, rev] = await Promise.all([segments(f30), bestOutreach(f30), replyIntelligence(f30), revenue()]);
  const P = "last 30 days";

  // 1. best segment by positive rate (needs real samples on both sides)
  const cands = seg.industry.filter((x) => x.contacted >= 10 && x.replies >= 3 && x.positive_rate != null);
  if (cands.length && rep.cohort.positive_rate != null) {
    const b = cands.sort((a, c) => (c.positive_rate as number) - (a.positive_rate as number))[0];
    if ((b.positive_rate as number) > (rep.cohort.positive_rate as number)) {
      out.push({
        level: "good", period: P, metric: `${b.positive_rate}% vs ${rep.cohort.positive_rate}% overall`,
        text: `${b.seg} generated a ${b.positive_rate}% positive-reply rate over the ${P} (${b.contacted} contacted), compared with ${rep.cohort.positive_rate}% across all segments.`,
      });
    }
  }
  // 2. follow-up vs intro attribution (observation; significance needs volume)
  const intro = best.steps.find((x) => x.step === 0);
  const fux = best.steps.filter((x) => x.step > 0);
  const fuSent = fux.reduce((a, x) => a + x.sent, 0), fuRep = fux.reduce((a, x) => a + x.replies, 0);
  if ((intro?.sent || 0) >= 20 && fuSent >= 10) {
    const total = (intro?.replies || 0) + fuRep;
    out.push({
      level: "info", period: P,
      metric: `${fuRep}/${total} replies after a follow-up`,
      text: `${fuRep} of ${total} replies came after a follow-up (${intro?.sent} intros vs ${fuSent} follow-ups sent).${total < 10 ? " Too early to call a winner — significance needs more replies." : ""}`,
    });
  }
  // 3. reply-rate trend 7d vs prior 7d
  const d7 = new Date(t + "T00:00:00Z"); d7.setUTCDate(d7.getUTCDate() - 6);
  const d14 = new Date(t + "T00:00:00Z"); d14.setUTCDate(d14.getUTCDate() - 13);
  const [r7, r14] = await Promise.all([
    replyIntelligence({ from: d7.toISOString().slice(0, 10), to: t }),
    replyIntelligence({ from: d14.toISOString().slice(0, 10), to: d7.toISOString().slice(0, 10) }),
  ]);
  if (r7.cohort.contacted >= 20 && r14.cohort.contacted >= 20 && r7.cohort.reply_rate != null && r14.cohort.reply_rate != null) {
    const up = r7.cohort.reply_rate >= r14.cohort.reply_rate;
    out.push({
      level: up ? "good" : "warn", period: "last 7 days vs prior 7",
      metric: `${r7.cohort.reply_rate}% vs ${r14.cohort.reply_rate}%`,
      text: `Reply rate ${up ? "rose" : "fell"} to ${r7.cohort.reply_rate}% over the last 7 days, from ${r14.cohort.reply_rate}% the week before.`,
    });
  }
  // 4. high-volume, no replies
  for (const x of seg.industry.filter((s) => s.contacted >= 20 && s.replies === 0).slice(0, 2)) {
    out.push({
      level: "warn", period: P, metric: `${x.contacted} contacted, 0 replies`,
      text: `${x.seg}: ${x.contacted} prospects contacted with zero replies — review targeting or copy for this segment.`,
    });
  }
  // 5. pipeline / opportunities
  if (rev.pipeline.opportunities > 0) {
    out.push({
      level: "info", period: "current",
      metric: `${rev.pipeline.opportunities} active, ₹${Number(rev.pipeline.openValue || 0).toLocaleString("en-IN")} open`,
      text: `You have ${rev.pipeline.opportunities} active ${rev.pipeline.opportunities === 1 ? "opportunity" : "opportunities"}${rev.pipeline.openProposals ? ` worth ₹${Number(rev.pipeline.openValue).toLocaleString("en-IN")} in open proposals` : " (replied, no meetings or proposals yet)"}.`,
    });
  }
  // 6. bounce rate
  const b = await pool.query(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'failed' AND error_message ILIKE '%bounc%' AND failed_at >= $1`, [`${f30.from}T00:00:00+05:30`]);
  const n = await pool.query(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at >= $1`, [`${f30.from}T00:00:00+05:30`]);
  const bounces = b.rows[0]?.n || 0, sent = n.rows[0]?.n || 0;
  if (sent >= 20 && bounces / sent > 0.05) {
    out.push({
      level: "warn", period: P, metric: `${bounces}/${sent} bounced (${Math.round((bounces / sent) * 1000) / 10}%)`,
      text: `Bounce rate is ${Math.round((bounces / sent) * 1000) / 10}% over the ${P} (${bounces} of ${sent} sends). MX pre-send checks are active since Sep 12 — new sends are protected.`,
    });
  }
  // 7. follow-up backlog
  const qb = await pool.query(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'queued'`);
  const qn = qb.rows[0]?.n || 0;
  if (qn > 0) {
    out.push({
      level: "info", period: "current", metric: `${qn} queued (~${Math.round((qn / 30) * 10) / 10} days at 30/day)`,
      text: `${qn} follow-ups are queued — about ${Math.round((qn / 30) * 10) / 10} days of backlog at the 30/day cap. Automation is draining them warm-first.`,
    });
  }
  // 8. replies with no meetings
  if (rep.cohort.replied >= 3) {
    const m = await pool.query(`SELECT COUNT(*)::int n FROM meetings WHERE created_at >= $1`, [`${f30.from}T00:00:00+05:30`]);
    if ((m.rows[0]?.n || 0) === 0) {
      out.push({
        level: "warn", period: P, metric: `${rep.cohort.replied} replies, 0 meetings`,
        text: `${rep.cohort.replied} replies but zero meetings booked in the ${P} — reply speed and call-booking need founder attention.`,
      });
    }
  }
  // 9. small-sample honesty
  if (rep.cohort.replied < 5) {
    out.push({
      level: "info", period: P, metric: `${rep.cohort.replied} replies so far`,
      text: `Only ${rep.cohort.replied} replies so far — segment rates stay hidden until volume grows. Totals above are exact.`,
    });
  }
  return { generated_at: new Date().toISOString(), period: P, insights: out };
}

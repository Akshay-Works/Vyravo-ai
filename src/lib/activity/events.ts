// ============================================================================
// SALES ACTIVITY LAYER (Tier 1) — the single source of truth for the Calendar,
// Daily Performance, Follow-up Monitor and Outreach Funnel.
// READ-ONLY over existing tables (leads, outreach_events, email_queue,
// meetings, proposals). Writes nothing, creates no tables/events, and never
// touches the outreach/follow-up automation — it only observes it.
// Day boundaries use ACTIVITY_TZ (Asia/Kolkata, matching the en-IN UI locale).
// ============================================================================
import { pool } from "@/db";
import { getOutreachConfig } from "@/lib/outreach/config";

export const ACTIVITY_TZ = "Asia/Kolkata";

export type MetricKey = "leads" | "outreach" | "followups" | "replies" | "positive" | "meetings" | "won";
export const METRICS: { key: MetricKey; label: string; icon: string }[] = [
  { key: "leads", label: "Leads", icon: "🧲" },
  { key: "outreach", label: "Outreach", icon: "📨" },
  { key: "followups", label: "Follow-ups", icon: "🔁" },
  { key: "replies", label: "Replies", icon: "💬" },
  { key: "positive", label: "Positive", icon: "⭐" },
  { key: "meetings", label: "Meetings", icon: "📅" },
  { key: "won", label: "Won", icon: "🏆" },
];
export type Counts = Record<MetricKey, number>;
export const ZERO: Counts = { leads: 0, outreach: 0, followups: 0, replies: 0, positive: 0, meetings: 0, won: 0 };

// "Positive" = replies classified positive / interested-followup by the
// deterministic Tier 2 classifier (uncertain replies stay "unknown").
const POSITIVE_LEAD_FILTER = `l.reply_class IN ('positive','interested_followup')`;

// IST calendar-day bounds [start, end) as timestamptz params (IST has no DST).
export function istDayBounds(dateYmd: string): [string, string] {
  return [`${dateYmd}T00:00:00+05:30`, addDaysYmd(dateYmd, 1) + "T00:00:00+05:30"];
}
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ACTIVITY_TZ });
}

// One round-trip: per-day counts for every metric inside [start, end).
export async function countsByDay(startIso: string, endIso: string): Promise<{ date: string; metric: MetricKey; n: number }[]> {
  const d = (col: string) => `(${col} AT TIME ZONE '${ACTIVITY_TZ}')::date`;
  const r = await pool.query(
    `SELECT d, metric, COUNT(*)::int n FROM (
       SELECT ${d("created_at")} d, 'leads' metric FROM leads WHERE created_at >= $1 AND created_at < $2
       UNION ALL
       SELECT ${d("sent_at")} d, 'outreach' metric FROM outreach_events
       WHERE follow_up_number = 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2
       UNION ALL
       SELECT ${d("sent_at")} d, 'followups' metric FROM outreach_events
       WHERE follow_up_number > 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2
       UNION ALL
       SELECT ${d("replied_at")} d, 'replies' metric FROM leads
       WHERE reply_received = true AND replied_at IS NOT NULL AND replied_at >= $1 AND replied_at < $2
       UNION ALL
       SELECT ${d("l.replied_at")} d, 'positive' metric FROM leads l
       WHERE ${POSITIVE_LEAD_FILTER} AND l.replied_at IS NOT NULL AND l.replied_at >= $1 AND l.replied_at < $2
       UNION ALL
       SELECT ${d("created_at")} d, 'meetings' metric FROM meetings WHERE created_at >= $1 AND created_at < $2
       UNION ALL
       SELECT ${d("accepted_at")} d, 'won' metric FROM proposals WHERE accepted_at IS NOT NULL AND accepted_at >= $1 AND accepted_at < $2
     ) s GROUP BY 1, 2`,
    [startIso, endIso]
  );
  return r.rows.map((x: any) => ({ date: new Date(x.d).toISOString().slice(0, 10), metric: x.metric as MetricKey, n: x.n }));
}

// ---------------------------------------------------------------- calendar
export async function monthCalendar(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const [s, e] = [`${first}T00:00:00+05:30`, `${year}-${mm}-${String(lastDay).padStart(2, "0")}T00:00:00+05:30`];
  // end-exclusive → first day of NEXT month
  const end = addDaysYmd(`${year}-${mm}-${String(lastDay).padStart(2, "0")}`, 1) + "T00:00:00+05:30";
  const rows = await countsByDay(s, end);
  const byDate: Record<string, Counts> = {};
  for (let d = 1; d <= lastDay; d++) byDate[`${year}-${mm}-${String(d).padStart(2, "0")}`] = { ...ZERO };
  for (const r of rows) if (byDate[r.date]) byDate[r.date][r.metric] = r.n;
  const days = Object.entries(byDate).map(([date, counts]) => ({
    date,
    counts,
    hasActivity: (Object.values(counts) as number[]).some((n) => n > 0),
  }));
  void e;
  return { tz: ACTIVITY_TZ, year, month, days };
}

// ---------------------------------------------------------------- day detail
const L = 50; // drill-down list cap (perf guard)
export async function dayDetail(dateYmd: string) {
  const [s, e] = istDayBounds(dateYmd);
  const [leads, intros, fus, replies, meetings, proposals] = await Promise.all([
    pool.query(`SELECT id, business_name, email, lead_score, source, created_at FROM leads WHERE created_at >= $1 AND created_at < $2 ORDER BY id DESC LIMIT ${L}`, [s, e]),
    pool.query(`SELECT e.id, e.lead_id, l.business_name, e.recipient_email, e.subject, e.sent_at, e.delivered_at FROM outreach_events e LEFT JOIN leads l ON l.id = e.lead_id WHERE e.follow_up_number = 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2 ORDER BY e.sent_at DESC LIMIT ${L}`, [s, e]),
    pool.query(`SELECT e.id, e.lead_id, l.business_name, e.recipient_email, e.subject, e.follow_up_number, e.sent_at, e.delivered_at FROM outreach_events e LEFT JOIN leads l ON l.id = e.lead_id WHERE e.follow_up_number > 0 AND e.status = 'sent' AND e.test_send = false AND e.sent_at >= $1 AND e.sent_at < $2 ORDER BY e.sent_at DESC LIMIT ${L}`, [s, e]),
    pool.query(`SELECT id, business_name, email, latest_reply_subject, latest_reply_preview, replied_at, follow_up_count, status FROM leads WHERE reply_received = true AND replied_at >= $1 AND replied_at < $2 ORDER BY replied_at DESC LIMIT ${L}`, [s, e]),
    pool.query(`SELECT id, title, scheduled_at, status, lead_id FROM meetings WHERE created_at >= $1 AND created_at < $2 ORDER BY scheduled_at LIMIT ${L}`, [s, e]),
    pool.query(`SELECT id, title, status, sent_at, accepted_at, total, currency FROM proposals WHERE (sent_at >= $1 AND sent_at < $2) OR (accepted_at >= $1 AND accepted_at < $2) ORDER BY id DESC LIMIT ${L}`, [s, e]),
  ]);
  const rows = await countsByDay(s, e);
  const counts: Counts = { ...ZERO };
  for (const r of rows) if (r.date === dateYmd) counts[r.metric] = r.n;
  return {
    tz: ACTIVITY_TZ, date: dateYmd, counts,
    leads: leads.rows, intros: intros.rows, followups: fus.rows,
    replies: replies.rows.map((x: any) => ({ ...x, after_followup: Number(x.follow_up_count || 0) > 0 })),
    meetings: meetings.rows, proposals: proposals.rows,
    positive_note: "Positive = replies classified positive / interested (uncertain → Unknown).",
  };
}

// ---------------------------------------------------------------- daily perf
export async function dailyPerformance() {
  const today = todayIst();
  const [ts, te] = istDayBounds(today);
  const prevEnd = ts;
  const prevStart = addDaysYmd(today, -7) + "T00:00:00+05:30";
  const [tRows, hRows] = await Promise.all([countsByDay(ts, te), countsByDay(prevStart, prevEnd)]);
  const todayCounts: Counts = { ...ZERO };
  for (const r of tRows) todayCounts[r.metric] = r.n;
  const hist: Record<MetricKey, number> = { ...ZERO };
  for (const r of hRows) hist[r.metric] += r.n;
  const avg7: Record<MetricKey, number | null> = {} as any;
  for (const m of Object.keys(ZERO) as MetricKey[]) avg7[m] = hist[m] > 0 ? Math.round((hist[m] / 7) * 10) / 10 : null;
  return { tz: ACTIVITY_TZ, date: today, today: todayCounts, avg7 };
}

// ---------------------------------------------------------------- FU monitor
export function fuStageLabel(fn: number, days: number[]): string {
  const d = days[fn - 1];
  return d != null ? `Day ${d}` : `FU${fn}`;
}
export async function followupMonitor() {
  const cfg = await getOutreachConfig().catch(() => ({ follow_up_days: [3, 7] })) as { follow_up_days: number[] };
  const days = cfg.follow_up_days?.length ? cfg.follow_up_days : [3, 7];
  const today = todayIst();
  const [ts, te] = istDayBounds(today);
  const one = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows[0]?.n ?? 0;
  const [sentToday, scheduled, delivered, sentTotal, failedTotal, repliedAfter] = await Promise.all([
    one(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`, [ts, te]),
    one(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'queued'`),
    one(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'sent' AND delivered_at IS NOT NULL`),
    one(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'sent' AND test_send = false`),
    one(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'failed'`),
    one(`SELECT COUNT(*)::int n FROM leads WHERE reply_received = true AND follow_up_count > 0`),
  ]);
  const upcoming = await pool.query(
    `SELECT e.id, e.lead_id, l.business_name, l.full_name, e.recipient_email, e.subject,
            e.follow_up_number, e.queued_at, q.scheduled_for, l.reply_received, l.status AS lead_status
     FROM outreach_events e
     LEFT JOIN leads l ON l.id = e.lead_id
     LEFT JOIN LATERAL (SELECT scheduled_for FROM email_queue q
                        WHERE (q.template_data->>'outreach_event_id')::int = e.id
                        ORDER BY q.id DESC LIMIT 1) q ON true
     WHERE e.follow_up_number > 0 AND e.status = 'queued'
     ORDER BY q.scheduled_for NULLS LAST, e.queued_at LIMIT 60`
  );
  const recent = await pool.query(
    `SELECT e.id, e.lead_id, l.business_name, l.full_name, e.recipient_email, e.subject,
            e.follow_up_number, e.queued_at, e.sent_at, e.delivered_at,
            l.reply_received, l.replied_at, l.latest_reply_subject
     FROM outreach_events e LEFT JOIN leads l ON l.id = e.lead_id
     WHERE e.follow_up_number > 0 AND e.status = 'sent' AND e.test_send = false
     ORDER BY e.sent_at DESC LIMIT 40`
  );
  const failed = await pool.query(
    `SELECT e.id, e.lead_id, l.business_name, e.recipient_email, e.follow_up_number, e.error_message, e.failed_at
     FROM outreach_events e LEFT JOIN leads l ON l.id = e.lead_id
     WHERE e.follow_up_number > 0 AND e.status = 'failed' ORDER BY e.failed_at DESC LIMIT 40`
  );
  const repliedRows = await pool.query(
    `SELECT id, business_name, email, follow_up_count, replied_at, latest_reply_subject, latest_reply_preview
     FROM leads WHERE reply_received = true AND follow_up_count > 0 ORDER BY replied_at DESC LIMIT 40`
  );
  const mapStage = (r: any) => ({ ...r, stage: fuStageLabel(Number(r.follow_up_number), days) });
  const classify = (err: string | null) => {
    const e = String(err || "");
    if (/no mail server|invalid recipient/i.test(e)) return "pre-send skip";
    if (/bounc/i.test(e)) return "bounced";
    return "failed";
  };
  return {
    tz: ACTIVITY_TZ, stages: days,
    cards: { sentToday, scheduled, delivered, sentTotal, failed: failedTotal, repliedAfterFu: repliedAfter },
    upcoming: upcoming.rows.map((r: any) => ({ ...mapStage(r), anomaly: r.reply_received === true || String(r.lead_status || "") === "do_not_contact" })),
    recent: recent.rows.map((r: any) => ({ ...mapStage(r), replied_after: r.reply_received === true && r.replied_at && r.sent_at && new Date(r.replied_at) > new Date(r.sent_at) })),
    failed: failed.rows.map((r: any) => ({ ...mapStage(r), kind: classify(r.error_message) })),
    repliedAfterFu: repliedRows.rows,
  };
}

// ---------------------------------------------------------------- funnel
export type FunnelRange = "today" | "7d" | "30d" | "month" | "custom";
export function rangeBounds(range: FunnelRange, from?: string, to?: string): [string, string] {
  const t = todayIst();
  if (range === "today") return istDayBounds(t);
  if (range === "7d") return [addDaysYmd(t, -6) + "T00:00:00+05:30", addDaysYmd(t, 1) + "T00:00:00+05:30"];
  if (range === "30d") return [addDaysYmd(t, -29) + "T00:00:00+05:30", addDaysYmd(t, 1) + "T00:00:00+05:30"];
  if (range === "month") return [`${t.slice(0, 7)}-01T00:00:00+05:30`, addDaysYmd(t, 1) + "T00:00:00+05:30"];
  const f = from || t, x = to || t;
  return [`${f}T00:00:00+05:30`, addDaysYmd(x, 1) + "T00:00:00+05:30"];
}
export async function outreachFunnel(range: FunnelRange, from?: string, to?: string) {
  const [s, e] = rangeBounds(range, from, to);
  const one = async (sql: string) => (await pool.query(sql, [s, e])).rows[0]?.n ?? 0;
  const [generated, contacted, replied, positive, meetings, proposals, won] = await Promise.all([
    one(`SELECT COUNT(*)::int n FROM leads WHERE created_at >= $1 AND created_at < $2`),
    one(`SELECT COUNT(DISTINCT lead_id)::int n FROM outreach_events WHERE follow_up_number = 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`),
    one(`SELECT COUNT(*)::int n FROM leads WHERE reply_received = true AND replied_at >= $1 AND replied_at < $2`),
    one(`SELECT COUNT(*)::int n FROM leads l WHERE ${POSITIVE_LEAD_FILTER} AND l.replied_at >= $1 AND l.replied_at < $2`),
    one(`SELECT COUNT(*)::int n FROM meetings WHERE created_at >= $1 AND created_at < $2`),
    one(`SELECT COUNT(*)::int n FROM proposals WHERE sent_at >= $1 AND sent_at < $2`),
    one(`SELECT COUNT(*)::int n FROM proposals WHERE accepted_at >= $1 AND accepted_at < $2`),
  ]);
  const stages = [
    { key: "generated", label: "Leads Generated", count: generated },
    { key: "contacted", label: "Contacted", count: contacted },
    { key: "replied", label: "Replied", count: replied },
    { key: "positive", label: "Positive Reply", count: positive, proxy: true },
    { key: "meeting", label: "Meeting", count: meetings },
    { key: "proposal", label: "Proposal", count: proposals },
    { key: "won", label: "Won", count: won },
  ];
  // step conversion vs the previous stage; null when the denominator is 0
  // (the UI shows "—", never a manufactured percentage).
  const steps = stages.map((st, i) => {
    if (i === 0) return { ...st, conv: null as number | null };
    const prev = stages[i - 1].count;
    return { ...st, conv: prev > 0 ? Math.round((st.count / prev) * 1000) / 10 : null };
  });
  return { tz: ACTIVITY_TZ, range, from: s.slice(0, 10), to: addDaysYmd(e.slice(0, 10), -1), stages: steps };
}

// ============================================================================
// TIER 3 — Intelligence & Optimization. READ-ONLY over existing tables, same
// source of truth and IST boundaries as Tier 1/2. Nothing here acts: every
// output is ranked/explained for HUMAN review (RECOMMENDATION → REVIEW →
// HUMAN APPROVAL → ACTION). Sample-gated throughout: weak evidence says so.
// ============================================================================
import { pool } from "@/db";
import { ACTIVITY_TZ, istDayBounds, outreachFunnel, todayIst } from "./events";
import { replyIntelligence, segments, revenue, bestOutreach, rate } from "./tier2";
import { normalizeReplyText, REPLY_CLASS_LABELS } from "./classify";
import { getOutreachConfig } from "../outreach/config";
import { readHeartbeats } from "./heartbeat";

// Lead 402's reply state is E2E-test residue, not a real prospect reply.
// It stays in historical counts (Tier 1/2 record what happened) but is
// excluded from ACTIONABLE queues (Tier 3 answers what needs doing).
const TEST_LEADS = [402];

export type Level = "HIGH" | "MED" | "LOW";
export type Priority = {
  id: string; level: Level; kind: string; title: string; detail: string;
  metric: string; lead_id: number | null; company: string | null; age_days: number | null;
};

// ------------------------------------------------------------------ helpers
function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function snippet(subject: string | null, preview: string | null, n = 140): string {
  return normalizeReplyText(subject, preview).replace(/^Re:\s*/i, "").slice(0, n);
}
async function cfg() {
  try { return await getOutreachConfig(); } catch { return { auto_outreach: false, daily_limit: 30 } as any; }
}
function hbAge(h: { last_run: string } | undefined): number | null {
  return h?.last_run ? (Date.now() - new Date(h.last_run).getTime()) / 3600000 : null;
}

// ------------------------------------------------------- OPPORTUNITY SCORES
export type Factor = { label: string; level: string; points: number; max: number; reason: string };
export type ScoredLead = {
  id: number; company: string | null; email: string | null; industry: string | null;
  lead_score: number; contact_priority: number | null; reply_class: string | null;
  replied_at: string | null; has_meeting: boolean; has_proposal: boolean;
  score: number; band: string; factors: Factor[];
};

export function opportunityScore(x: any): { score: number; band: string; factors: Factor[] } {
  const factors: Factor[] = [];
  // Fit (lead_score) /30
  const s = Number(x.lead_score || 0);
  factors.push(s >= 85 ? { label: "ICP fit", level: "High", points: 30, max: 30, reason: `score ${s} (≥85)` }
    : s >= 70 ? { label: "ICP fit", level: "Medium", points: 22, max: 30, reason: `score ${s} (70–84)` }
    : s >= 60 ? { label: "ICP fit", level: "Medium", points: 14, max: 30, reason: `score ${s} (60–69)` }
    : { label: "ICP fit", level: "Low", points: 6, max: 30, reason: `score ${s} (<60)` });
  // Contactability /15
  const p = x.contact_priority;
  factors.push(p === 1 ? { label: "Contactability", level: "High", points: 15, max: 15, reason: "P1 (email+phone+web+LI)" }
    : p === 2 ? { label: "Contactability", level: "High", points: 12, max: 15, reason: "P2 (email+phone)" }
    : p === 3 ? { label: "Contactability", level: "Medium", points: 8, max: 15, reason: "P3 (email only)" }
    : p === 4 ? { label: "Contactability", level: "Low", points: 5, max: 15, reason: "P4 (phone only)" }
    : { label: "Contactability", level: "Low", points: 2, max: 15, reason: "unranked" });
  // Engagement /20
  const replied = !!x.reply_received;
  factors.push(replied ? { label: "Engagement", level: "High", points: 20, max: 20, reason: "prospect replied" }
    : x.contacted ? { label: "Engagement", level: "Medium", points: 8, max: 20, reason: "intro sent, no reply yet" }
    : { label: "Engagement", level: "Low", points: 0, max: 20, reason: "no outreach yet" });
  // Buying intent /25
  const rc = String(x.reply_class || "");
  const intent: Factor =
    x.has_proposal ? { label: "Buying intent", level: "High", points: 25, max: 25, reason: "proposal requested/sent" }
    : x.has_meeting ? { label: "Buying intent", level: "High", points: 25, max: 25, reason: "meeting booked" }
    : rc === "positive" ? { label: "Buying intent", level: "High", points: 25, max: 25, reason: "reply classified positive" }
    : rc === "question" || rc === "interested_followup" ? { label: "Buying intent", level: "High", points: 18, max: 25, reason: `reply: ${REPLY_CLASS_LABELS[rc as keyof typeof REPLY_CLASS_LABELS]}` }
    : replied ? { label: "Buying intent", level: "Medium", points: 10, max: 25, reason: `reply: ${REPLY_CLASS_LABELS[rc as keyof typeof REPLY_CLASS_LABELS] || "unknown"}` }
    : { label: "Buying intent", level: "Low", points: 0, max: 25, reason: "no buying signal yet" };
  factors.push(intent);
  // Recency /10
  const last = x.replied_at || x.last_activity || null;
  const age = daysAgo(last) ?? 999;
  factors.push(age <= 3 ? { label: "Recency", level: "High", points: 10, max: 10, reason: "active in last 3 days" }
    : age <= 7 ? { label: "Recency", level: "Medium", points: 7, max: 10, reason: "active in last 7 days" }
    : age <= 14 ? { label: "Recency", level: "Medium", points: 4, max: 10, reason: "active in last 14 days" }
    : last ? { label: "Recency", level: "Low", points: 2, max: 10, reason: `last active ${age}d ago` }
    : { label: "Recency", level: "Low", points: 0, max: 10, reason: "no activity yet" });
  const score = factors.reduce((a, f) => a + f.points, 0);
  const band = score >= 75 ? "High Priority" : score >= 50 ? "Medium Priority" : "Watch";
  return { score, band, factors };
}

export async function opportunities(limit = 30) {
  const r = await pool.query(
    `SELECT l.id, l.business_name company, l.email, l.industry, l.lead_score, l.contact_priority,
            l.reply_received, l.reply_class, l.replied_at,
            (m.lead_id IS NOT NULL) has_meeting, (p.lead_id IS NOT NULL) has_proposal,
            (e0.lead_id IS NOT NULL) contacted,
            GREATEST(l.replied_at, l.last_contacted_at) last_activity
     FROM leads l
     LEFT JOIN (SELECT DISTINCT lead_id FROM meetings WHERE lead_id IS NOT NULL) m ON m.lead_id = l.id
     LEFT JOIN (SELECT DISTINCT lead_id FROM proposals WHERE lead_id IS NOT NULL) p ON p.lead_id = l.id
     LEFT JOIN (SELECT DISTINCT lead_id FROM outreach_events WHERE follow_up_number = 0 AND status = 'sent' AND test_send = false) e0 ON e0.lead_id = l.id
     WHERE COALESCE(l.status,'') NOT IN ('archived','do_not_contact','lost') AND l.id <> ALL($1)
       AND (l.reply_received = true OR COALESCE(l.lead_score,0) >= 70 OR m.lead_id IS NOT NULL OR p.lead_id IS NOT NULL)
     ORDER BY l.reply_received DESC, l.lead_score DESC NULLS LAST LIMIT 200`,
    [TEST_LEADS]
  );
  const scored: ScoredLead[] = r.rows.map((x: any) => ({ ...x, ...opportunityScore(x) }));
  scored.sort((a, b) => b.score - a.score || (b.lead_score || 0) - (a.lead_score || 0));
  return {
    note: "Opportunity score ranks where founder time pays best — it is NOT a conversion probability. Test lead(s) excluded.",
    count: scored.length, leads: scored.slice(0, limit),
  };
}

// ------------------------------------------------------- PRIORITIES + QUEUE
export async function priorities(): Promise<{ generated_at: string; items: Priority[] }> {
  const items: Priority[] = [];
  // replied leads needing a human (no meeting/proposal yet, not terminal)
  const rep = await pool.query(
    `SELECT l.id, l.business_name, l.email, l.reply_class, l.latest_reply_subject, l.latest_reply_preview,
            l.replied_at, l.lead_score
     FROM leads l
     LEFT JOIN (SELECT DISTINCT lead_id FROM meetings WHERE lead_id IS NOT NULL) m ON m.lead_id = l.id
     LEFT JOIN (SELECT DISTINCT lead_id FROM proposals WHERE lead_id IS NOT NULL) p ON p.lead_id = l.id
     WHERE l.status = 'replied' AND l.id <> ALL($1) AND m.lead_id IS NULL AND p.lead_id IS NULL
     ORDER BY l.replied_at DESC LIMIT 30`, [TEST_LEADS]);
  for (const x of rep.rows) {
    const age = daysAgo(x.replied_at);
    const base = { lead_id: x.id, company: x.business_name, age_days: age };
    const sn = snippet(x.latest_reply_subject, x.latest_reply_preview);
    const wantsInfo = /pric|cost|quote|demo|trial|call|meet|detail|proposal/i.test(sn);
    if (x.reply_class === "positive") items.push({
      id: `rep-${x.id}`, level: "HIGH", kind: "reply", title: `Reply to ${x.business_name || "prospect"} — positive`,
      detail: sn, metric: `replied ${age}d ago · score ${x.lead_score ?? "—"}`, ...base,
    });
    else if (x.reply_class === "question") items.push({
      id: `rep-${x.id}`, level: "HIGH", kind: "reply", title: `Answer ${x.business_name || "prospect"}'s question`,
      detail: sn, metric: `replied ${age}d ago · score ${x.lead_score ?? "—"}`, ...base,
    });
    else if (x.reply_class === "interested_followup" || wantsInfo) items.push({
      id: `rep-${x.id}`, level: "HIGH", kind: "reply", title: `Send info to ${x.business_name || "prospect"} (requested)`,
      detail: sn, metric: `replied ${age}d ago · score ${x.lead_score ?? "—"}`, ...base,
    });
    else if (x.reply_class === "unsubscribe") items.push({
      id: `rep-${x.id}`, level: "HIGH", kind: "dnc", title: `Confirm unsubscribe — ${x.business_name || "prospect"}`,
      detail: "Prospect asked to stop emails. Confirm DNC in outreach (AI never auto-suppresses).", metric: `replied ${age}d ago`, ...base,
    });
    else if (x.reply_class === "not_interested") items.push({
      id: `rep-${x.id}`, level: "LOW", kind: "reply", title: `Closed lost — ${x.business_name || "prospect"}`,
      detail: "Not interested. No action unless you disagree with the classification.", metric: `replied ${age}d ago`, ...base,
    });
    else items.push({
      id: `rep-${x.id}`, level: "MED", kind: "reply", title: `Review reply from ${x.business_name || "prospect"}`,
      detail: sn || "No readable preview.", metric: `${REPLY_CLASS_LABELS[x.reply_class as keyof typeof REPLY_CLASS_LABELS] || "Unknown"} · ${age}d ago`, ...base,
    });
  }
  // meetings approaching / booked
  const mt = await pool.query(
    `SELECT m.id, m.title, m.scheduled_at, m.status, l.business_name, l.id lead_id
     FROM meetings m LEFT JOIN leads l ON l.id = m.lead_id
     WHERE m.status = 'scheduled' AND m.scheduled_at > now() AND m.scheduled_at < now() + interval '7 days'
     ORDER BY m.scheduled_at LIMIT 10`);
  for (const x of mt.rows) {
    const hrs = Math.round((new Date(x.scheduled_at).getTime() - Date.now()) / 3600000);
    items.push({
      id: `mt-${x.id}`, level: hrs <= 48 ? "HIGH" : "MED", kind: "meeting",
      title: `${hrs <= 48 ? "Prepare for" : "Upcoming"}: ${x.title}`,
      detail: `${x.business_name || "no linked lead"} · ${new Date(x.scheduled_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      metric: hrs <= 48 ? `in ${hrs}h` : `in ${Math.round(hrs / 24)}d`, lead_id: x.lead_id, company: x.business_name, age_days: null,
    });
  }
  // proposals awaiting decision
  const pr = await pool.query(
    `SELECT p.id, p.title, p.total, p.currency, p.sent_at, l.business_name, l.id lead_id
     FROM proposals p LEFT JOIN leads l ON l.id = p.lead_id
     WHERE p.sent_at IS NOT NULL AND p.accepted_at IS NULL AND p.rejected_at IS NULL ORDER BY p.sent_at LIMIT 10`);
  for (const x of pr.rows) {
    const age = daysAgo(x.sent_at) ?? 0;
    items.push({
      id: `pr-${x.id}`, level: age > 5 ? "HIGH" : "MED", kind: "proposal",
      title: `${age > 5 ? "Nudge" : "Watch"} proposal: ${x.title || `#${x.id}`}`,
      detail: `${x.business_name || "unlinked"} · sent ${age}d ago, no decision.`,
      metric: x.total != null ? `₹${Number(x.total).toLocaleString("en-IN")}` : "no value", lead_id: x.lead_id, company: x.business_name, age_days: age,
    });
  }
  // failed important deliveries
  const fl = await pool.query(
    `SELECT e.id, e.lead_id, l.business_name, l.lead_score, e.follow_up_number, e.error_message, e.failed_at
     FROM outreach_events e JOIN leads l ON l.id = e.lead_id
     WHERE e.status = 'failed' AND (e.follow_up_number > 0 OR COALESCE(l.lead_score,0) >= 80)
     ORDER BY e.failed_at DESC LIMIT 10`);
  for (const x of fl.rows) {
    items.push({
      id: `fl-${x.id}`, level: "MED", kind: "failure",
      title: `Review failed ${x.follow_up_number > 0 ? `FU${x.follow_up_number}` : "intro"} — ${x.business_name || "prospect"}`,
      detail: String(x.error_message || "send failed").slice(0, 120),
      metric: `score ${x.lead_score ?? "—"}`, lead_id: x.lead_id, company: x.business_name, age_days: daysAgo(x.failed_at),
    });
  }
  // high-score leads never contacted (REVIEW — automation will queue them)
  const hi = await pool.query(
    `SELECT l.id, l.business_name, l.lead_score, l.created_at FROM leads l
     WHERE COALESCE(l.status,'') NOT IN ('archived','do_not_contact','lost','skipped')
       AND COALESCE(l.lead_score,0) >= 85 AND l.email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id)
     ORDER BY l.lead_score DESC LIMIT 5`);
  for (const x of hi.rows) {
    items.push({
      id: `hi-${x.id}`, level: "MED", kind: "review",
      title: `Review high-potential lead — ${x.business_name || `#${x.id}`}`,
      detail: "Automation will queue it. Review fit only — do not hand-send.",
      metric: `score ${x.lead_score}`, lead_id: x.id, company: x.business_name, age_days: daysAgo(x.created_at),
    });
  }
  const rank: Record<Level, number> = { HIGH: 0, MED: 1, LOW: 2 };
  items.sort((a, b) => rank[a.level] - rank[b.level] || (a.age_days ?? 999) - (b.age_days ?? 999));
  return { generated_at: new Date().toISOString(), items: items.slice(0, 25) };
}

export async function attentionQueue() {
  const [pri, anom, health] = await Promise.all([priorities(), anomalies(), automationHealth()]);
  const items = pri.items.filter((x) => x.kind !== "review" && (x.level === "HIGH" || x.level === "MED"));
  const sysFails = health.systems.filter((s) => s.status === "failed" || s.status === "warning")
    .map((s) => ({ id: `sys-${s.key}`, level: (s.status === "failed" ? "HIGH" : "MED") as Level, kind: "automation", title: `${s.label}: ${s.status}`, detail: s.summary, metric: s.status, lead_id: null, company: null, age_days: null }));
  const anoms = anom.anomalies.filter((a) => a.level !== "info")
    .map((a, i) => ({ id: `anom-${i}`, level: (a.level === "alert" ? "HIGH" : "MED") as Level, kind: "anomaly", title: a.title, detail: a.text, metric: a.metric, lead_id: null, company: null, age_days: null }));
  return { generated_at: new Date().toISOString(), items: [...items, ...sysFails, ...anoms], clear: items.length + sysFails.length + anoms.length === 0 };
}

// ------------------------------------------------------- RECOMMENDATIONS
export type RecVerdict = "recommend" | "insufficient";
export type SegmentRec = {
  dim: string; seg: string; verdict: RecVerdict; leads: number; contacted: number;
  replies: number; positive: number; meetings: number; rate: number | null;
  overall_rate: number | null; why: string;
};

export async function recommendFocus() {
  const t = todayIst();
  const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 29);
  const f = { from: d.toISOString().slice(0, 10), to: t };
  const [seg, rep, best] = await Promise.all([segments(f), replyIntelligence(f), bestOutreach(f)]);
  const P = "last 30 days";
  const recs: SegmentRec[] = [];
  for (const dim of ["industry", "source"] as const) {
    for (const x of (seg[dim] as any[]).slice(0, 10)) {
      const enough = x.contacted >= 30 && x.replies >= 5;
      const better = x.positive_rate != null && rep.cohort.positive_rate != null && x.positive_rate > rep.cohort.positive_rate;
      recs.push({
        dim, seg: x.seg, verdict: enough && better ? "recommend" : "insufficient",
        leads: x.leads, contacted: x.contacted, replies: x.replies, positive: x.positive,
        meetings: x.meetings, rate: x.positive_rate, overall_rate: rep.cohort.positive_rate,
        why: enough
          ? `${x.seg}: ${x.positive_rate}% positive-reply rate across ${x.contacted} contacted (${P}), vs ${rep.cohort.positive_rate}% overall.`
          : `Insufficient data: ${x.seg} has ${x.contacted} contacted / ${x.replies} replies (need ≥30 / ≥5).`,
      });
    }
  }
  recs.sort((a, b) => (a.verdict === b.verdict ? (b.contacted - a.contacted) : a.verdict === "recommend" ? -1 : 1));
  // outreach recs
  const orecs: { topic: string; verdict: RecVerdict; text: string; sample: string; why: string }[] = [];
  const intro = best.steps.find((x) => x.step === 0);
  const fu = best.steps.filter((x) => x.step > 0);
  const fuSent = fu.reduce((a, x) => a + x.sent, 0);
  orecs.push({
    topic: "Initial vs follow-up", sample: `${intro?.sent || 0} intros, ${fuSent} follow-ups`,
    verdict: (intro?.sent || 0) >= 50 && fuSent >= 50 ? "recommend" : "insufficient",
    text: (intro?.sent || 0) >= 50 && fuSent >= 50
      ? `Intros: ${intro?.reply_rate ?? "—"}% reply rate; follow-ups: ${fu.map((x) => `FU${x.step} ${x.reply_rate ?? "—"}%`).join(", ")}.`
      : "Insufficient data: sequence comparison needs ≥50 sends per arm.",
    why: `Replies attributed to the latest email before each reply (${P}). Positive replies and meetings outrank reply rate.`,
  });
  const bigHours = best.byHour.filter((x) => x.sent >= 50);
  orecs.push({
    topic: "Send timing", sample: `${best.byHour.length} active hours (IST)`,
    verdict: bigHours.length >= 2 ? "recommend" : "insufficient",
    text: bigHours.length >= 2
      ? `Best hour: ${bigHours.sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0].hour}:00 IST.`
      : "Insufficient data: timing comparison needs ≥2 hours with ≥50 sends each.",
    why: `Send-hour buckets in IST with reply attribution (${P}).`,
  });
  orecs.push({
    topic: "Template / subject", sample: "1 template version per step",
    verdict: "insufficient",
    text: "Only one template version per step is in use — no A/B comparison is possible. Subjects are per-lead personalized variants.",
    why: "A template test needs two live variants with ≥50 sends each.",
  });
  return { period: P, overall: { contacted: rep.cohort.contacted, replied: rep.cohort.replied, positive: rep.cohort.positive }, segments: recs.slice(0, 8), outreach: orecs };
}

// ------------------------------------------------------- FORECAST
export async function forecast() {
  const rev = await revenue();
  const t = todayIst();
  const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 89);
  const w = await pool.query(
    `SELECT COUNT(*)::int total, COUNT(CASE WHEN accepted_at IS NOT NULL THEN 1 END)::int won,
            COUNT(CASE WHEN rejected_at IS NOT NULL THEN 1 END)::int lost FROM proposals WHERE sent_at >= $1`,
    [`${d.toISOString().slice(0, 10)}T00:00:00+05:30`]);
  const tot = w.rows[0]?.total || 0, wonN = w.rows[0]?.won || 0;
  const winRate = tot >= 5 ? Math.round((wonN / tot) * 1000) / 10 : null;
  const weighted = winRate != null ? Math.round((rev.pipeline.openValue * winRate) / 100) : null;
  const mt = await pool.query(`SELECT COUNT(*)::int n FROM meetings WHERE created_at >= $1`, [`${d.toISOString().slice(0, 10)}T00:00:00+05:30`]);
  return {
    actual: { mrr: rev.actual.mrr, invoicesPaid: rev.actual.invoicesPaid },
    pipeline: { value: rev.pipeline.openValue, proposals: rev.pipeline.openProposals, opportunities: rev.pipeline.opportunities },
    forecast: {
      winRate, weightedPipeline: weighted,
      verdict: winRate != null ? "estimated" : "insufficient",
      note: winRate != null
        ? `Weighted by ${winRate}% win rate over ${tot} proposals (90d). An estimate — never guaranteed revenue.`
        : "Insufficient history: weighted forecast needs ≥5 decided proposals in 90 days.",
    },
    funnel90d: { meetings: mt.rows[0]?.n || 0, proposals: tot, won: wonN },
    target: rev.target, progress: rev.progress,
  };
}

// ------------------------------------------------------- BOTTLENECK
export async function bottleneck() {
  const f = await outreachFunnel("30d");
  const s = Object.fromEntries(f.stages.map((x: any) => [x.key, x]));
  const steps = [
    { from: "generated", to: "contacted", label: "Leads → Contacted", fix: "deliverability / sending capacity / queue backlog" },
    { from: "contacted", to: "replied", label: "Contacted → Reply", fix: "messaging quality / targeting / subject lines" },
    { from: "replied", to: "positive", label: "Reply → Positive", fix: "ICP targeting / offer fit" },
    { from: "positive", to: "meeting", label: "Positive → Meeting", fix: "reply speed / call booking / sales handling" },
    { from: "meeting", to: "proposal", label: "Meeting → Proposal", fix: "discovery quality / proposal speed" },
    { from: "proposal", to: "won", label: "Proposal → Won", fix: "closing / pricing / follow-through" },
  ].map((x) => {
    const a = s[x.from]?.count || 0, b = s[x.to]?.count || 0;
    const conv = a > 0 ? Math.round((b / a) * 1000) / 10 : null;
    return { ...x, from_n: a, to_n: b, conv, meaningful: a >= 20 };
  });
  const ranked = steps.filter((x) => x.meaningful && x.conv != null).sort((a, b) => (a.conv as number) - (b.conv as number));
  const weak = ranked[0] || null;
  return {
    period: "last 30 days", steps,
    current: weak
      ? { label: weak.label, text: `${weak.label} is the largest constraint: ${weak.to_n} of ${weak.from_n} converted (${weak.conv}%). Likely lever: ${weak.fix}.`, fix: weak.fix }
      : { label: "—", text: "Insufficient data: no funnel step has ≥20 entering leads yet.", fix: "volume" },
  };
}

// ------------------------------------------------------- ANOMALIES
export type Anomaly = { level: "alert" | "watch" | "info"; title: string; text: string; metric: string };
export async function anomalies(): Promise<{ generated_at: string; anomalies: Anomaly[] }> {
  const out: Anomaly[] = [];
  const t = todayIst();
  const dt = (ymd: string, n: number) => { const d = new Date(ymd + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const y = dt(t, -1); // yesterday (complete IST day)
  const avgStart = dt(t, -8), avgEnd = dt(t, -1); // prior 7 complete days
  const B = (a: string, b: string) => [`${a}T00:00:00+05:30`, `${b}T00:00:00+05:30`];
  const [ys, ye] = B(y, t);
  const [as, ae] = B(avgStart, avgEnd);
  const n = async (sql: string, p: any[]) => (await pool.query(sql, p)).rows[0]?.n ?? 0;
  // leads generated
  const ly = await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at >= $1 AND created_at < $2`, [ys, ye]);
  const la = await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at >= $1 AND created_at < $2`, [as, ae]);
  const laAvg = Math.round((la / 7) * 10) / 10;
  if (laAvg >= 10 && ly < laAvg * 0.5) out.push({ level: "alert", title: "Lead generation dropped", text: `Lead generation dropped ${Math.round((1 - ly / laAvg) * 100)}% vs the 7-day average.`, metric: `${ly}/day vs ${laAvg}/day avg` });
  // sends
  const sy = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`, [ys, ye]);
  const sa = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`, [as, ae]);
  const saAvg = Math.round((sa / 7) * 10) / 10;
  const c = await cfg();
  const queued = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'queued'`, []);
  if (saAvg >= 10 && sy < saAvg * 0.5) out.push({ level: c.auto_outreach && queued > 0 ? "alert" : "watch", title: "Outreach volume fell", text: `Sends fell ${Math.round((1 - sy / saAvg) * 100)}% vs the 7-day average${c.auto_outreach ? ` (AUTO ON, ${queued} queued)` : " (AUTO OFF)"}.`, metric: `${sy}/day vs ${saAvg}/day avg` });
  if (sy === 0 && c.auto_outreach && queued > 0) out.push({ level: "alert", title: "No sends in 24h", text: `Zero sends yesterday with AUTO ON and ${queued} emails queued — the sender may be stuck.`, metric: "0 sent, queue waiting" });
  // bounces
  const by = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'failed' AND error_message ILIKE '%bounc%' AND failed_at >= $1 AND failed_at < $2`, [ys, ye]);
  const ba = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'failed' AND error_message ILIKE '%bounc%' AND failed_at >= $1 AND failed_at < $2`, [as, ae]);
  const baAvg = Math.round((ba / 7) * 10) / 10;
  if ((baAvg >= 2 && by > baAvg * 2) || by >= 5) out.push({ level: "watch", title: "Bounce spike", text: `Bounces spiked yesterday — check list quality / MX skips.`, metric: `${by} vs ${baAvg}/day avg` });
  // FU failures
  const fy = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'failed' AND failed_at >= $1 AND failed_at < $2`, [ys, ye]);
  if (fy > 0) out.push({ level: "watch", title: "Follow-ups failing", text: `${fy} follow-up${fy === 1 ? " was" : "s were"} marked failed yesterday — see Follow-up Monitor.`, metric: `${fy} failed` });
  // duplicate spike (same email created yesterday that already existed)
  const dy = await n(`SELECT COUNT(*)::int n FROM leads l WHERE l.created_at >= $1 AND l.created_at < $2 AND l.email IS NOT NULL AND EXISTS (SELECT 1 FROM leads x WHERE x.id <> l.id AND lower(x.email) = lower(l.email) AND x.created_at < l.created_at)`, [ys, ye]);
  if (dy >= 5) out.push({ level: "watch", title: "Duplicate lead spike", text: `${dy} leads created yesterday reuse an email already in the CRM — dedupe may be slipping.`, metric: `${dy} dupes` });
  // ingestion gap
  if (ly === 0) out.push({ level: "alert", title: "No new leads in 24h", text: `Zero leads ingested yesterday (7-day avg ${laAvg}/day). Check engine runs.`, metric: `0 vs ${laAvg}/day avg` });
  return { generated_at: new Date().toISOString(), anomalies: out };
}

// ------------------------------------------------------- HEALTH
export type SysStatus = "healthy" | "warning" | "failed" | "unknown";
export type SysHealth = { key: string; label: string; status: SysStatus; summary: string; signals: { label: string; value: string; ok: boolean }[] };

export async function automationHealth(): Promise<{ generated_at: string; systems: SysHealth[] }> {
  const systems: SysHealth[] = [];
  const n = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows[0]?.n ?? 0;
  const c = await cfg();
  const leads24 = await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at > now() - interval '24 hours'`);
  const leads48 = await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at > now() - interval '48 hours'`);
  systems.push({
    key: "lead_gen", label: "Lead generation", summary: `${leads24} CRM leads in 24h (ingestion signal)`,
    status: leads24 > 0 ? "healthy" : leads48 > 0 ? "warning" : "failed",
    signals: [{ label: "CRM leads 24h / 48h", value: `${leads24} / ${leads48}`, ok: leads24 > 0 }],
  });
  const scored = await n(`SELECT COUNT(*)::int n FROM leads WHERE COALESCE(lead_score,0) > 0`);
  const total = await n(`SELECT COUNT(*)::int n FROM leads`);
  const cov = total ? Math.round((scored / total) * 100) : 0;
  systems.push({
    key: "enrich", label: "Lead enrichment", summary: `${cov}% of leads scored`,
    status: cov >= 80 ? "healthy" : cov >= 50 ? "warning" : "failed",
    signals: [{ label: "Score coverage", value: `${scored}/${total}`, ok: cov >= 80 }],
  });
  const eng24 = await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at > now() - interval '24 hours' AND source IN ('lead_engine','funnel2','osm')`);
  systems.push({
    key: "ingest", label: "CRM ingestion", summary: `${eng24} engine leads ingested in 24h`,
    status: eng24 > 0 ? "healthy" : "warning",
    signals: [{ label: "Engine sources 24h", value: String(eng24), ok: eng24 > 0 }],
  });
  const intro48 = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number = 0 AND status = 'sent' AND test_send = false AND sent_at > now() - interval '48 hours'`);
  const qIntro = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number = 0 AND status = 'queued'`);
  systems.push({
    key: "outreach", label: "Initial outreach", summary: c.auto_outreach ? `${intro48} intros sent in 48h · ${qIntro} queued` : `AUTO OFF · ${qIntro} queued`,
    status: !c.auto_outreach ? "warning" : intro48 > 0 || qIntro === 0 ? "healthy" : "failed",
    signals: [
      { label: "AUTO", value: c.auto_outreach ? "ON" : "OFF", ok: !!c.auto_outreach },
      { label: "Intros 48h / queued", value: `${intro48} / ${qIntro}`, ok: intro48 > 0 || qIntro === 0 },
    ],
  });
  const fu72 = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'sent' AND test_send = false AND sent_at > now() - interval '72 hours'`);
  const qFu = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'queued'`);
  systems.push({
    key: "followups", label: "Follow-up automation", summary: `${fu72} follow-ups sent in 72h · ${qFu} queued`,
    status: !c.auto_outreach ? "warning" : fu72 > 0 || qFu === 0 ? "healthy" : "failed",
    signals: [{ label: "FU sent 72h / queued", value: `${fu72} / ${qFu}`, ok: fu72 > 0 || qFu === 0 }],
  });
  const sent7 = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at > now() - interval '7 days'`);
  const bnc7 = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'failed' AND error_message ILIKE '%bounc%' AND failed_at > now() - interval '7 days'`);
  const br = sent7 ? Math.round((bnc7 / sent7) * 1000) / 10 : 0;
  systems.push({
    key: "delivery", label: "Email delivery", summary: `${br}% bounce rate (7d) · MX pre-check active`,
    status: sent7 === 0 ? "unknown" : br < 5 ? "healthy" : br < 10 ? "warning" : "failed",
    signals: [{ label: "Bounced / sent (7d)", value: `${bnc7} / ${sent7}`, ok: br < 5 }],
  });
  const seenMax = await n(`SELECT COUNT(*)::int n FROM outreach_replies_seen WHERE matched_at > now() - interval '7 days'`);
  const rhb = await readHeartbeats(["reply_poll"]);
  const rp = rhb["reply_poll"];
  const rpAge = hbAge(rp);
  const rpStatus: SysStatus = !rp ? "unknown"
    : rp.status === "error" ? (rpAge != null && rpAge < 48 ? "warning" : "failed")
    : rpAge != null && rpAge < 24 ? "healthy" : rpAge != null && rpAge < 48 ? "warning" : "failed";
  systems.push({
    key: "replies", label: "Reply processing",
    summary: !rp ? "No poll recorded yet (populates on the next poll)" : `last poll ${rpAge!.toFixed(1)}h ago · ${rp.status}${rp.detail?.applied ? ` · ${rp.detail.applied} applied` : ""}`,
    status: rpStatus,
    signals: [
      { label: "Last poll", value: rp ? `${rpAge!.toFixed(1)}h ago (${rp.status})` : "never", ok: rpStatus === "healthy" },
      { label: "Replies matched (7d)", value: String(seenMax), ok: true },
    ],
  });
  const sent24 = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at > now() - interval '24 hours'`);
  const chb = await readHeartbeats(["cron_emails", "cron_kick_engine"]);
  const ce = chb["cron_emails"], ck = chb["cron_kick_engine"];
  const ceAge = hbAge(ce), ckAge = hbAge(ck);
  const cronStatus: SysStatus = !ce && !ck ? "unknown"
    : (ceAge ?? 999) < 36 || (ckAge ?? 999) < 36 ? "healthy"
    : (ceAge ?? 999) < 72 || (ckAge ?? 999) < 72 ? "warning" : "failed";
  systems.push({
    key: "cron", label: "Scheduled jobs",
    summary: !ce && !ck ? "No cron run recorded yet (populates on the next scheduled run)" : `emails ${ce ? ceAge!.toFixed(1) + "h ago" : "never"} · kick ${ck ? ckAge!.toFixed(1) + "h ago" : "never"}`,
    status: cronStatus,
    signals: [
      { label: "cron/emails", value: ce ? `${ceAge!.toFixed(1)}h ago (${ce.status})` : "never", ok: (ceAge ?? 999) < 36 },
      { label: "cron/kick-engine", value: ck ? `${ckAge!.toFixed(1)}h ago (${ck.status})` : "never", ok: (ckAge ?? 999) < 36 },
      { label: "Sends 24h", value: String(sent24), ok: sent24 > 0 },
    ],
  });
  const withId = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND resend_id IS NOT NULL AND sent_at > now() - interval '7 days'`);
  systems.push({
    key: "integrations", label: "External integrations", summary: `${withId}/${sent7} recent sends carry provider IDs (Resend OK)`,
    status: sent7 > 0 && withId === sent7 ? "healthy" : sent7 > 0 ? "warning" : "unknown",
    signals: [{ label: "Provider IDs (7d)", value: `${withId}/${sent7}`, ok: sent7 > 0 && withId === sent7 }],
  });
  systems.push({
    key: "activity", label: "Calendar / activity logging", summary: "Tier 1/2 queries live — this page proves the logging path",
    status: "healthy", signals: [{ label: "Read path", value: "OK", ok: true }],
  });
  return { generated_at: new Date().toISOString(), systems };
}

// ------------------------------------------------------- DATA QUALITY
export async function dataQuality() {
  const q = async (label: string, countSql: string, sampleSql: string, note: string) => {
    const c = await pool.query(countSql);
    const s = await pool.query(sampleSql);
    return { label, count: Number(c.rows[0]?.n || 0), sample: s.rows, note };
  };
  const EMAIL_OK = `l.email ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'`;
  return {
    generated_at: new Date().toISOString(),
    note: "Flags only — nothing is auto-deleted. Review in CRM.",
    buckets: await Promise.all([
      q("Missing email", `SELECT COUNT(*)::int n FROM leads l WHERE l.email IS NULL OR TRIM(l.email) = ''`,
        `SELECT id, business_name label FROM leads WHERE email IS NULL OR TRIM(email) = '' ORDER BY id DESC LIMIT 5`, "Unemailable until enriched."),
      q("Missing phone", `SELECT COUNT(*)::int n FROM leads l WHERE l.phone IS NULL OR TRIM(l.phone) = ''`,
        `SELECT id, business_name label FROM leads WHERE phone IS NULL OR TRIM(phone) = '' ORDER BY id DESC LIMIT 5`, "No call/WhatsApp path."),
      q("Invalid email format", `SELECT COUNT(*)::int n FROM leads l WHERE l.email IS NOT NULL AND TRIM(l.email) <> '' AND NOT (${EMAIL_OK})`,
        `SELECT id, email label FROM leads l WHERE l.email IS NOT NULL AND TRIM(l.email) <> '' AND NOT (${EMAIL_OK}) LIMIT 5`, "Fails provider + MX checks."),
      q("Missing company", `SELECT COUNT(*)::int n FROM leads l WHERE l.business_name IS NULL OR TRIM(l.business_name) = ''`,
        `SELECT id, email label FROM leads WHERE business_name IS NULL OR TRIM(business_name) = '' LIMIT 5`, "Personalization falls back to generic."),
      q("Duplicate emails", `SELECT COUNT(*)::int n FROM (SELECT lower(email) FROM leads WHERE email IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d`,
        `SELECT lower(email) label, COUNT(*)::int n, array_agg(id ORDER BY id) ids FROM leads WHERE email IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 5`, "Same inbox, multiple lead rows."),
      q("Stale qualified", `SELECT COUNT(*)::int n FROM leads l WHERE l.created_at < now() - interval '30 days' AND COALESCE(l.lead_score,0) >= 60 AND COALESCE(l.status,'') NOT IN ('archived','replied','won','lost','do_not_contact') AND NOT EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id)`,
        `SELECT id, business_name label FROM leads l WHERE l.created_at < now() - interval '30 days' AND COALESCE(l.lead_score,0) >= 60 AND COALESCE(l.status,'') NOT IN ('archived','replied','won','lost','do_not_contact') AND NOT EXISTS (SELECT 1 FROM outreach_events e WHERE e.lead_id = l.id) ORDER BY lead_score DESC LIMIT 5`, "Qualified 30d+, never emailed."),
      q("Unlinked meetings/proposals", `SELECT ((SELECT COUNT(*) FROM meetings WHERE lead_id IS NULL) + (SELECT COUNT(*) FROM proposals WHERE lead_id IS NULL))::int n`,
        `SELECT id, title label FROM meetings WHERE lead_id IS NULL LIMIT 3`, "Excluded from lead-attributed metrics."),
    ]),
  };
}

// ------------------------------------------------------- EXEC SUMMARY
export async function execSummary() {
  const t = todayIst();
  const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 6);
  const f = { from: d.toISOString().slice(0, 10), to: t };
  const [s, e0] = [`${f.from}T00:00:00+05:30`, `${f.to}T00:00:00+05:30`];
  const e = new Date(new Date(e0).getTime() + 86400000).toISOString();
  const n = async (sql: string) => (await pool.query(sql, [s, e])).rows[0]?.n ?? 0;
  const metrics = {
    leads: await n(`SELECT COUNT(*)::int n FROM leads WHERE created_at >= $1 AND created_at < $2`),
    outreach: await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number = 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`),
    followups: await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE follow_up_number > 0 AND status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`),
    replies: await n(`SELECT COUNT(*)::int n FROM leads WHERE reply_received AND replied_at >= $1 AND replied_at < $2`),
    positive: await n(`SELECT COUNT(*)::int n FROM leads WHERE reply_class IN ('positive','interested_followup') AND replied_at >= $1 AND replied_at < $2`),
    meetings: await n(`SELECT COUNT(*)::int n FROM meetings WHERE created_at >= $1 AND created_at < $2`),
    proposals: await n(`SELECT COUNT(*)::int n FROM proposals WHERE sent_at >= $1 AND sent_at < $2`),
    won: await n(`SELECT COUNT(*)::int n FROM proposals WHERE accepted_at >= $1 AND accepted_at < $2`),
  };
  const rev = await revenue();
  const [bn, seg, opps, rec] = await Promise.all([bottleneck(), segments(f), opportunities(5), recommendFocus()]);
  const good = seg.industry.filter((x) => x.contacted >= 10 && x.replies > 0).sort((a, b) => b.replies - a.replies)[0];
  const bad = seg.industry.filter((x) => x.contacted >= 20 && x.replies === 0).sort((a, b) => b.contacted - a.contacted)[0];
  const focus = rec.segments.find((x) => x.verdict === "recommend");
  return {
    period: `${f.from} → ${f.to} (IST)`, metrics, newMrr: rev.actual.newMrrMonth,
    worked: [
      metrics.followups > 0 ? `${metrics.followups} follow-ups sent (automation draining warm-first).` : null,
      metrics.replies > 0 ? `${metrics.replies} repl${metrics.replies === 1 ? "y" : "ies"} received (${metrics.positive} positive).` : null,
      good ? `${good.seg}: ${good.replies} replies from ${good.contacted} contacted.` : null,
    ].filter(Boolean),
    didnt: [
      metrics.replies === 0 && metrics.outreach > 0 ? `${metrics.outreach} emails sent with zero replies — messaging/targeting review due.` : null,
      bad ? `${bad.seg}: ${bad.contacted} contacted, zero replies.` : null,
      metrics.replies > 0 && metrics.meetings === 0 ? `${metrics.replies} replies but no meetings booked.` : null,
    ].filter(Boolean),
    bottleneck: bn.current,
    bestIcp: good ? `${good.seg} (${good.replies}/${good.contacted} replies)` : "Insufficient data",
    topOpportunities: opps.leads.map((x) => ({ id: x.id, company: x.company, score: x.score, band: x.band })),
    focusNextWeek: focus ? `${focus.seg}: ${focus.why}` : "Insufficient data for an ICP call — build reply volume first; protect mornings for fast reply handling.",
  };
}

// ------------------------------------------------------- COMMAND CENTER
export async function commandCenter() {
  const t = todayIst();
  const d = new Date(t + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
  const y = d.toISOString().slice(0, 10);
  const [ys, ye] = istDayBounds(y);
  const n = async (sql: string) => (await pool.query(sql, [ys, ye])).rows[0]?.n ?? 0;
  const [pri, rev, bn] = await Promise.all([priorities(), revenue(), bottleneck()]);
  const sent = await n(`SELECT COUNT(*)::int n FROM outreach_events WHERE status = 'sent' AND test_send = false AND sent_at >= $1 AND sent_at < $2`);
  const replies = await n(`SELECT COUNT(*)::int n FROM leads WHERE reply_received AND replied_at >= $1 AND replied_at < $2`);
  const attn = pri.items.filter((x) => x.kind !== "review" && x.level !== "LOW");
  return {
    date: y, tz: ACTIVITY_TZ,
    yesterday: { sent, replies },
    attention: attn.length,
    top: pri.items.slice(0, 3),
    pipeline: rev.pipeline.openValue, opportunities: rev.pipeline.opportunities,
    mrr: rev.actual.mrr, target: rev.target, progress: rev.progress,
    bottleneck: bn.current.text,
  };
}

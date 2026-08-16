// Analytics Engine — queries ALL existing data sources to build a unified
// business intelligence dashboard. Uses real data only — never fabricates.
import { eq, and, sql, gte, lte, desc, count, sum } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  leads, activities, analyticsEvents, voiceCalls, invoices, clients, projects,
} from "@/db/schema";
import { proposals, proposalEvents } from "@/db/proposal-schema";
import { kbQueries, kbKnowledgeGaps } from "@/db/knowledge-schema";

export interface DateFilter {
  from?: string; // ISO
  to?: string;   // ISO
  period?: "today" | "yesterday" | "7d" | "30d" | "month" | "quarter" | "year" | "all";
}

export function dateClause(filter: DateFilter, column: any, defaultFrom?: string) {
  if (filter.period === "all") return undefined;
  const now = new Date();
  let from: Date;
  let to: Date = filter.to ? new Date(filter.to) : now;
  if (filter.period === "today") { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  else if (filter.period === "yesterday") { const y = new Date(now); y.setDate(y.getDate() - 1); from = new Date(y.getFullYear(), y.getMonth(), y.getDate()); to = from; }
  else if (filter.period === "7d") { from = new Date(now.getTime() - 7 * 86400000); }
  else if (filter.period === "30d" || !filter.period) { from = new Date(now.getTime() - 30 * 86400000); }
  else if (filter.period === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (filter.period === "quarter") { from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1); }
  else if (filter.period === "year") { from = new Date(now.getFullYear(), 0, 1); }
  else { from = new Date(now.getTime() - 30 * 86400000); }
  if (filter.from) from = new Date(filter.from);
  return and(gte(column, from.toISOString()), lte(column, to.toISOString()));
}

// ---------------------------------------------------------------------------
// MAIN DASHBOARD — returns everything needed for the executive overview
// ---------------------------------------------------------------------------
export async function getDashboard(filter: DateFilter = {}) {
  const dc = (col: any) => dateClause(filter, col);
  const prev = getPreviousPeriod(filter);

  const [
    leadStats, leadSources, voiceStats, propStats, revenueStats,
    clientStats, projectStats, activeProjects, aiStats, recurringRevenue,
  ] = await Promise.all([
    aggregateLeads(dc),
    aggregateLeadSources(dc),
    aggregateVoiceCalls(dc),
    aggregateProposals(dc),
    aggregateRevenue(dc),
    aggregateClients(),
    aggregateProjects(dc),
    aggregateActiveProjects(),
    aggregateAiStats(dc),
    aggregateRecurringRevenue(dc),
  ]);

  // Previous period comparisons
  let prevLeadStats: any = null;
  let prevRevenue: any = null;
  let prevPropStats: any = null;
  try {
    const pdc = (col: any) => and(gte(col, prev.from.toISOString()), lte(col, prev.to.toISOString()));
    [prevLeadStats, prevRevenue, prevPropStats] = await Promise.all([
      aggregateLeads(pdc),
      aggregateRevenue(pdc),
      aggregateProposals(pdc),
    ]).catch(() => [null, null, null]);
  } catch {}

  return {
    dateRange: { from: (filter.from || ""), to: (filter.to || ""), period: filter.period || "30d" },
    overview: {
      totalLeads: { value: leadStats.total, prev: prevLeadStats?.total || 0 },
      qualifiedLeads: { value: leadStats.qualified, prev: prevLeadStats?.qualified || 0 },
      totalCalls: { value: voiceStats.total, prev: 0 },
      proposalsSent: { value: propStats.sent, prev: prevPropStats?.sent || 0 },
      proposalsAccepted: { value: propStats.accepted, prev: prevPropStats?.accepted || 0 },
      activeClients: clientStats.active,
      activeProjects: activeProjects,
      revenue: { value: revenueStats.total, prev: prevRevenue?.total || 0 },
      conversionRate: leadStats.total > 0 ? Math.round((leadStats.qualified / leadStats.total) * 1000) / 10 : 0,
    },
    leads: leadStats,
    leadSources,
    discoveryCalls: voiceStats,
    proposals: propStats,
    revenue: revenueStats,
    recurringRevenue,
    clients: clientStats,
    projects: projectStats,
    ai: aiStats,
    funnel: buildFunnel(leadStats, propStats, clientStats),
  };
}

function getPreviousPeriod(filter: DateFilter): { from: Date; to: Date } {
  const now = new Date();
  let from: Date;
  let to: Date;
  switch (filter.period) {
    case "today": { from = new Date(now); from.setDate(from.getDate() - 1); to = new Date(from); break; }
    case "yesterday": { from = new Date(now); from.setDate(from.getDate() - 2); to = new Date(from); to.setDate(to.getDate() + 1); break; }
    case "7d": { from = new Date(now.getTime() - 14 * 86400000); to = new Date(now.getTime() - 7 * 86400000); break; }
    case "30d": { from = new Date(now.getTime() - 60 * 86400000); to = new Date(now.getTime() - 30 * 86400000); break; }
    case "month": { const m = now.getMonth(); const y = now.getFullYear(); from = new Date(y, m - 1, 1); to = new Date(y, m, 0); break; }
    case "quarter": { const q = Math.floor(now.getMonth() / 3); from = new Date(now.getFullYear(), (q - 1) * 3, 1); to = new Date(now.getFullYear(), q * 3, 0); break; }
    case "year": { from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear() - 1, 11, 31); break; }
    default: { from = new Date(now.getTime() - 60 * 86400000); to = new Date(now.getTime() - 30 * 86400000); }
  }
  return { from, to: to || from };
}

// ---------------------------------------------------------------------------
// AGGREGATION HELPERS
// ---------------------------------------------------------------------------
async function aggregateLeads(dc: any) {
  const base = db.select({ n: count(), qual: sql`count(*) filter (where ${leads.leadCategory} is not null)` }).from(leads);
  const rows = dc ? await base.where(dc) : await base;
  const byStage = await (dc
    ? db.select({ stage: leads.stage, n: count() }).from(leads).where(dc).groupBy(leads.stage).orderBy(sql`count(*) desc`)
    : db.select({ stage: leads.stage, n: count() }).from(leads).groupBy(leads.stage).orderBy(sql`count(*) desc`));
  const bySource = await (dc
    ? db.select({ source: leads.source, n: count() }).from(leads).where(dc).groupBy(leads.source).orderBy(sql`count(*) desc`)
    : db.select({ source: leads.source, n: count() }).from(leads).groupBy(leads.source).orderBy(sql`count(*) desc`));
  return {
    total: Number(rows[0]?.n ?? 0),
    qualified: Number(rows[0]?.qual ?? 0),
    byStage: Object.fromEntries(byStage.map((r: any) => [r.stage || "new", Number(r.n)])),
    bySource: Object.fromEntries(bySource.map((r: any) => [r.source || "unknown", Number(r.n)])),
  };
}

async function aggregateLeadSources(dc: any) {
  const rows = await (dc
    ? db.select({ source: leads.source, n: count(), qual: sql`count(*) filter (where ${leads.leadCategory} is not null)` }).from(leads).where(dc).groupBy(leads.source).orderBy(sql`count(*) desc`)
    : db.select({ source: leads.source, n: count(), qual: sql`count(*) filter (where ${leads.leadCategory} is not null)` }).from(leads).groupBy(leads.source).orderBy(sql`count(*) desc`));
  return rows.map((r) => ({ source: r.source || "unknown", count: Number(r.n), qualified: Number(r.qual) }));
}

async function aggregateVoiceCalls(dc: any) {
  const base = db.select({ n: count(), answered: sql`count(*) filter (where ${voiceCalls.leadStatus} = 'qualified')` }).from(voiceCalls);
  const rows = dc ? await base.where(dc) : await base;
  return { total: Number(rows[0]?.n ?? 0), answered: Number(rows[0]?.answered ?? 0) };
}

async function aggregateProposals(dc: any) {
  const all = dc
    ? await db.select().from(proposals).where(dc)
    : await db.select().from(proposals);
  return {
    total: all.length,
    sent: all.filter((p: any) => p.sentAt || p.status === "sent" || p.status === "viewed" || p.status === "accepted").length,
    viewed: all.filter((p: any) => p.viewedAt || p.status === "viewed" || p.status === "accepted").length,
    accepted: all.filter((p: any) => p.status === "accepted").length,
    rejected: all.filter((p: any) => p.status === "rejected").length,
    expired: all.filter((p: any) => p.status === "expired").length,
    totalValue: all.reduce((s, p: any) => s + Number(p.total || 0), 0),
    acceptedValue: all.filter((p: any) => p.status === "accepted").reduce((s, p: any) => s + Number(p.total || 0), 0),
    conversionRate: all.filter((p: any) => p.status === "sent" || p.status === "viewed" || p.status === "accepted").length > 0
      ? Math.round((all.filter((p: any) => p.status === "accepted").length / all.filter((p: any) => p.status === "sent" || p.status === "viewed" || p.status === "accepted").length) * 1000) / 10
      : 0,
  };
}

async function aggregateRevenue(dc: any) {
  const allInvoices = dc
    ? await db.select().from(invoices).where(dc)
    : await db.select().from(invoices);
  const total = allInvoices.reduce((s, i: any) => s + Number(i.total || 0), 0);
  const paid = allInvoices.filter((i: any) => i.status === "paid").reduce((s, i: any) => s + Number(i.total || 0), 0);
  const outstanding = allInvoices.filter((i: any) => i.status === "sent" || i.status === "draft" || i.status === "overdue")
    .reduce((s, i: any) => s + Number(i.total || 0), 0);
  const byMonth: Record<string, number> = {};
  for (const i of allInvoices as any[]) {
    const m = i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 7) : "unknown";
    byMonth[m] = (byMonth[m] || 0) + Number(i.total || 0);
  }
  return { total, paid, outstanding, byMonth, count: allInvoices.length };
}

async function aggregateRecurringRevenue(dc: any) {
  const all = dc
    ? await db.select().from(invoices).where(dc)
    : await db.select().from(invoices);
  const monthly = all.filter((i: any) => Number(i.monthlyRecurring || 0) > 0)
    .reduce((s, i: any) => s + Number(i.monthlyRecurring || 0), 0);
  return { monthlyTotal: monthly };
}

async function aggregateClients() {
  const [active, total] = await Promise.all([
    db.select({ n: count() }).from(clients).where(eq(clients.status as any, "active")).then((r) => Number(r[0]?.n ?? 0)),
    db.select({ n: count() }).from(clients).then((r) => Number(r[0]?.n ?? 0)),
  ]);
  return { total, active, byIndustry: [] };
}

async function aggregateProjects(dc: any) {
  const all = dc ? await db.select().from(projects).where(dc) : await db.select().from(projects);
  return {
    total: all.length,
    active: all.filter((p: any) => !["completed", "cancelled"].includes(p.status || "")).length,
    completed: all.filter((p: any) => p.status === "completed").length,
    onHold: all.filter((p: any) => p.status === "on_hold").length,
    delayed: all.filter((p: any) => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "completed" && p.status !== "cancelled").length,
    averageProgress: all.length > 0 ? Math.round(all.reduce((s, p: any) => s + (p.progress || 0), 0) / all.length) : 0,
  };
}

async function aggregateActiveProjects() {
  return db.select({ n: count() }).from(projects).where(sql`${projects.status} NOT IN ('completed','cancelled')`).then((r) => Number(r[0]?.n ?? 0));
}

async function aggregateAiStats(dc: any) {
  let kb = { total: 0, unanswered: 0, gaps: 0 };
  try {
    const kbQuery = dc
      ? db.select({ n: count() }).from(kbQueries).where(dc)
      : db.select({ n: count() }).from(kbQueries);
    const gapQuery = db.select({ n: count() }).from(kbKnowledgeGaps).where(eq(kbKnowledgeGaps.status, "open"));
    const [q, g] = await Promise.all([
      kbQuery.then((r) => Number(r[0]?.n ?? 0)),
      gapQuery.then((r) => Number(r[0]?.n ?? 0)),
    ]);
    kb = { total: q, unanswered: q, gaps: g };
  } catch {}

  return { knowledgeBase: kb };
}

function buildFunnel(leads: any, proposals: any, clients: any) {
  return {
    stages: [
      { label: "Leads", count: leads.total },
      { label: "Qualified Leads", count: leads.qualified },
      { label: "Proposals Sent", count: proposals.sent },
      { label: "Proposals Viewed", count: proposals.viewed },
      { label: "Accepted", count: proposals.accepted },
      { label: "Paying Clients", count: clients.total },
    ],
  };
}

// ---------------------------------------------------------------------------
// REVENUE BY SERVICE / SOURCE (additional)
// ---------------------------------------------------------------------------
export async function getRevenueByService() {
  // Since proposals have selectedServices, we can estimate service revenue
  try {
    const all = await db.select({ content: proposals.proposalContent, total: proposals.total, status: proposals.status })
      .from(proposals).where(eq(proposals.status, "accepted"));
    const byService: Record<string, number> = {};
    for (const p of all as any[]) {
      const content = p.content?.services || [];
      const total = Number(p.total || 0);
      if (content.length) {
        const perService = total / content.length;
        for (const svc of content) {
          byService[svc.name || "Other"] = (byService[svc.name || "Other"] || 0) + perService;
        }
      } else {
        byService["Other"] = (byService["Other"] || 0) + total;
      }
    }
    return Object.entries(byService).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  } catch { return []; }
}

export async function getLeadTrends(filter: DateFilter = {}) {
  const days = filter.period === "year" ? 365 : filter.period === "quarter" ? 90 : 30;
  const res = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS d, count(*)::int AS n
     FROM leads WHERE created_at > now() - interval '${days} days'
     GROUP BY d ORDER BY d`
  );
  const byDate: Record<string, number> = {};
  const start = new Date(Date.now() - days * 86400000);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    byDate[d] = 0;
  }
  for (const row of res.rows as any[]) byDate[row.d] = Number(row.n);
  return Object.entries(byDate).map(([date, count]) => ({ date, count }));
}

export async function getRevenueTrend(filter: DateFilter = {}) {
  const days = filter.period === "year" ? 365 : filter.period === "quarter" ? 90 : 30;
  const res = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM-DD') AS d, sum(total) AS rev
     FROM invoices WHERE created_at > now() - interval '${days} days'
     GROUP BY d ORDER BY d`
  );
  const byDate: Record<string, number> = {};
  const start = new Date(Date.now() - days * 86400000);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    byDate[d] = 0;
  }
  for (const row of res.rows as any[]) byDate[row.d] = Number(row.rev || 0);
  return Object.entries(byDate).map(([date, revenue]) => ({ date, revenue }));
}

export async function getRecentActivity(limit = 20) {
  const rows = await db
    .select()
    .from(activities)
    .orderBy(desc(activities.createdAt))
    .limit(limit);
  return rows.map((r: any) => ({
    id: r.id, type: r.type, action: r.action, description: r.description,
    createdAt: r.createdAt,
  }));
}

export async function getAlerts() {
  const alerts: { type: string; message: string; link?: string }[] = [];
  // Overdue invoices
  const overdue = await pool.query(
    `SELECT count(*)::int AS n FROM invoices WHERE status = 'sent' AND due_date < now()`
  );
  if (Number(overdue.rows[0]?.n || 0) > 0) alerts.push({ type: "warning", message: `${overdue.rows[0].n} overdue invoices`, link: "/admin/invoices" });
  // Proposals awaiting response (sent > 5 days, not viewed)
  const pendingProp = await pool.query(
    `SELECT count(*)::int AS n FROM proposals WHERE status = 'sent' AND sent_at < now() - interval '5 days'`
  );
  if (Number(pendingProp.rows[0]?.n || 0) > 0) alerts.push({ type: "warning", message: `${pendingProp.rows[0].n} proposals awaiting response for 5+ days`, link: "/admin/proposals" });
  // Knowledge gaps
  try {
    const gaps = await pool.query(`SELECT count(*)::int AS n FROM kb_knowledge_gaps WHERE status = 'open'`);
    if (Number(gaps.rows[0]?.n || 0) > 0) alerts.push({ type: "info", message: `${gaps.rows[0].n} knowledge gaps`, link: "/admin/knowledge-base/gaps" });
  } catch {}
  return alerts;
}

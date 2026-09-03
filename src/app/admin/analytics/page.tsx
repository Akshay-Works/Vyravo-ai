"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart,
} from "recharts";

const COLORS = ["#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#14B8A6", "#6366F1", "#D946EF"];

const PERIODS = [
  { v: "today", l: "Today" }, { v: "yesterday", l: "Yesterday" }, { v: "7d", l: "7 Days" },
  { v: "30d", l: "30 Days" }, { v: "month", l: "This Month" }, { v: "quarter", l: "This Quarter" },
  { v: "year", l: "This Year" }, { v: "all", l: "All Time" },
];

function KpiCard({ title, value, prev, format, icon }: any) {
  const displayVal = format === "money" ? `$${Number(value || 0).toLocaleString()}` : format === "pct" ? `${value || 0}%` : format === "decimal" ? Number(value || 0).toFixed(1) : String(value ?? "—");
  const change = prev > 0 ? ((value - prev) / prev * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-grey-dark uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-3xl font-semibold font-[var(--font-heading)]">{displayVal}</p>
      {prev > 0 && (
        <p className={`text-xs mt-1 ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs previous period
        </p>
      )}
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState<any>({ overview: {}, funnel: { stages: [] }, proposals: {} });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
      const d = await res.json();
      if (d.overview || d.funnel2 || d.engine) setData(d);
    } catch {} finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const ov = data.overview || {};
  const funnel = data.funnel || { stages: [] };
  const leadSources = data.leadSources || [];
  const services = data.services || [];
  const alerts = data.alerts || [];
  const activity = data.activity || [];
  const revenueTrend = data.revenueTrend || [];
  const leadTrends = data.leadTrends || [];
  const f2 = data.funnel2 || {};
  const f2s = f2.stats || {};
  const f2q = f2.queues || [];
  const f2day = f2.byDay || [];
  const f2runs = f2.runs || [];
  const eng = data.engine || {};
  const engS = eng.stats || {};
  const engSources = eng.sources || [];
  const engDay = eng.byDay || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
            Analytics <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="mt-1 text-sm text-grey">Real-time business intelligence from all Vyravo AI systems</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/visitors" className="text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10">👀 Visitor traffic</a>
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${period === p.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-surface border border-border" />)}
        </div>
      ) : (
        <>
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a: any, i: number) => (
                <div key={i} className={`flex items-center justify-between rounded-xl border p-4 ${a.type === "warning" ? "border-orange-500/30 bg-orange-500/5 text-orange-400" : "border-blue-500/30 bg-blue-500/5 text-blue-400"}`}>
                  <span className="text-sm">⚠️ {a.message}</span>
                  {a.link && <Link href={a.link} className="text-xs px-2.5 py-1 rounded-lg border border-current hover:bg-current/10 transition-colors">View →</Link>}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard title="Total Revenue" value={ov.revenue?.value} prev={ov.revenue?.prev} format="money" icon="💰" />
            <KpiCard title="Conversion Rate" value={ov.conversionRate} format="pct" icon="🎯" />
            <KpiCard title="Total Leads" value={ov.totalLeads?.value} prev={ov.totalLeads?.prev} icon="👥" />
            <KpiCard title="Qualified Leads" value={ov.qualifiedLeads?.value} prev={ov.qualifiedLeads?.prev} icon="✅" />
            <KpiCard title="Proposals Sent" value={ov.proposalsSent?.value} prev={ov.proposalsSent?.prev} icon="📄" />
            <KpiCard title="Proposals Accepted" value={ov.proposalsAccepted?.value} prev={ov.proposalsAccepted?.prev} icon="🎉" />
            <KpiCard title="Active Clients" value={ov.activeClients} icon="🏢" />
            <KpiCard title="Active Projects" value={ov.activeProjects} icon="📋" />
          </div>

          {/* ================= LEAD ENGINES (Funnel 1 + Funnel 2) ================= */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-semibold font-[var(--font-heading)]">Lead Engines <span className="gradient-text">(daily 9:30 AM)</span></h2>
                <p className="text-xs text-grey">Funnel 2 = LinkedIn + Email pipeline · Funnel 1 = engine leads · synced from the same database</p>
              </div>
              <div className="flex gap-2">
                <Link href="/admin/funnel2" className="text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10">Funnel 2 admin →</Link>
                <Link href="/admin/leads" className="text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10">Engine leads →</Link>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <KpiCard title="F2 Total (period)" value={f2s.total} icon="🧲" />
              <KpiCard title="F2 Qualified 70+" value={f2s.qualified} icon="✅" />
              <KpiCard title="F2 Avg Score" value={f2s.avg_qualified_score} icon="📊" />
              <KpiCard title="F2 Contacted" value={f2s.contacted} icon="📞" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <KpiCard title="Queue: Both" value={f2s.queue_both} icon="🔗" />
              <KpiCard title="Queue: LinkedIn" value={f2s.queue_linkedin} icon="💼" />
              <KpiCard title="Queue: Email" value={f2s.queue_email} icon="✉️" />
              <KpiCard title="Queue: No channel" value={f2s.queue_none} icon="🕳️" />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-3 text-zinc-200">Funnel 2 — discovered vs qualified per day</h3>
                {f2day.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No Funnel 2 data for this period.</p> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={f2day}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="discovered" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="qualified" fill="#10B981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3 text-zinc-200">Funnel 2 — outreach queue split</h3>
                {f2q.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No queue data yet.</p> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={f2q} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} label={(props: any) => `${props.name}: ${props.value}`}>
                        {f2q.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mt-5">
              <div>
                <h3 className="text-sm font-semibold mb-3 text-zinc-200">Funnel 2 — daily runs</h3>
                {f2runs.length === 0 ? <p className="text-sm text-grey-dark py-6 text-center">No runs recorded yet.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-grey-dark">
                          <th className="p-2">Run</th><th className="p-2">Started</th><th className="p-2">Candidates</th><th className="p-2">Qualified</th><th className="p-2">Dupes</th><th className="p-2">Status</th><th className="p-2">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f2runs.map((r: any) => (
                          <tr key={r.id} className="border-b border-border/60 last:border-0">
                            <td className="p-2 text-zinc-200">#{r.id}</td>
                            <td className="p-2 text-grey">{new Date(r.started_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                            <td className="p-2 text-grey">{r.candidates ?? "—"}</td>
                            <td className="p-2 text-emerald-400">{r.qualified ?? "—"}</td>
                            <td className="p-2 text-grey">{r.duplicates ?? "—"}</td>
                            <td className="p-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${r.status === "SUCCESS" ? "border-green-500/30 text-green-400" : r.status === "LIMITED" ? "border-amber-500/30 text-amber-400" : "border-red-500/30 text-red-400"}`}>{r.status || "—"}</span></td>
                            <td className="p-2 text-grey">{(r.runtime_sec || 0) / 60 > 1 ? `${Math.round((r.runtime_sec || 0) / 60)}m` : `${r.runtime_sec || 0}s`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3 text-zinc-200">Funnel 1 — engine leads</h3>
                {engDay.length === 0 && Object.keys(engS).length === 0 ? <p className="text-sm text-grey-dark py-6 text-center">No engine lead data.</p> : (
                  <>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <KpiCard title="Total" value={engS.total} icon="👥" />
                      <KpiCard title="Hot 90+" value={engS.hot} icon="🔥" />
                      <KpiCard title="High 75-89" value={engS.high} icon="⭐" />
                    </div>
                    {engDay.length > 0 && (
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={engDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v: string) => v.slice(5)} />
                          <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                          <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                          <Bar dataKey="count" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    {engSources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {engSources.map((src: any, i: number) => (
                          <span key={src.name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-grey">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {src.name}: {src.count}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Revenue Trend</h2>
              {revenueTrend.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No revenue data for this period.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={revenueTrend}>
                    <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                    <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Lead Trend</h2>
              {leadTrends.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No lead data for this period.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leadTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                    <Bar dataKey="count" fill="#06B6D4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Conversion Funnel</h2>
              {funnel.stages.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No data available.</p> : (
                <div className="space-y-3">
                  {funnel.stages.map((stage: any, i: number) => {
                    const maxCount = funnel.stages[0]?.count || 1;
                    const pct = maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0;
                    return (
                      <div key={stage.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-grey">{stage.label}</span>
                          <span className="text-white font-medium">{stage.count}</span>
                        </div>
                        <div className="h-6 rounded-lg bg-white/5 overflow-hidden flex">
                          <div className="h-full rounded-lg bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${pct}%` }} />
                          <span className="text-xs text-grey-dark ml-2 self-center">{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Lead Sources</h2>
              {leadSources.length === 0 ? <p className="text-sm text-grey-dark py-8 text-center">No lead source data.</p> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={leadSources} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={(props: any) => `${props.source || ""}: ${props.count || 0}`}>
                      {leadSources.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Revenue by Service</h2>
              {services.length === 0 ? <p className="text-sm text-grey-dark py-6 text-center">Not enough data yet.</p> : (
                <div className="space-y-3">
                  {services.map((svc: any, i: number) => (
                    <div key={svc.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-grey"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{svc.name}</span>
                        <span className="text-white font-medium">${(svc.value || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (svc.value / Math.max(...services.map((s: any) => s.value), 1)) * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Proposal Activity</h2>
              {data.proposals ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-2xl font-semibold">{data.proposals.total}</p><p className="text-xs text-grey mt-1">Total</p></div>
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-2xl font-semibold">{data.proposals.sent}</p><p className="text-xs text-grey mt-1">Sent</p></div>
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-2xl font-semibold">{data.proposals.viewed}</p><p className="text-xs text-grey mt-1">Viewed</p></div>
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-2xl font-semibold">{data.proposals.accepted}</p><p className="text-xs text-grey mt-1">Accepted</p></div>
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-xl font-semibold text-grey">{data.proposals.acceptedValue ? `$${(data.proposals.acceptedValue).toLocaleString()}` : "—"}</p><p className="text-xs text-grey mt-1">Accepted Value</p></div>
                  <div className="bg-bg rounded-lg p-4 text-center"><p className="text-xl font-semibold text-grey">{data.proposals.conversionRate}%</p><p className="text-xs text-grey mt-1">Conversion</p></div>
                </div>
              ) : <p className="text-sm text-grey-dark py-6 text-center">No proposal data.</p>}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-border"><h2 className="text-lg font-semibold font-[var(--font-heading)]">Recent Activity</h2></div>
              {activity.length === 0 ? (
                <p className="text-sm text-grey-dark p-6 text-center">No recent activity.</p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto">
                  {activity.map((a: any) => (
                    <div key={a.id} className="px-5 py-3 text-sm">
                      <p className="text-grey">{a.action}</p>
                      {a.description && <p className="text-xs text-grey-dark mt-0.5">{a.description}</p>}
                      <p className="text-[11px] text-grey-dark mt-0.5">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">AI Systems</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg rounded-lg p-4 text-center">
                  <p className="text-sm text-grey-dark mb-1">KB Queries</p>
                  <p className="text-2xl font-semibold">{data.ai?.knowledgeBase?.total ?? 0}</p>
                </div>
                <div className="bg-bg rounded-lg p-4 text-center">
                  <p className="text-sm text-grey-dark mb-1">Knowledge Gaps</p>
                  <p className="text-2xl font-semibold">{data.ai?.knowledgeBase?.gaps ?? 0}</p>
                </div>
                <div className="bg-bg rounded-lg p-4 text-center">
                  <p className="text-sm text-grey-dark mb-1">Voice Calls</p>
                  <p className="text-2xl font-semibold">{data.discoveryCalls?.total ?? 0}</p>
                </div>
                <div className="bg-bg rounded-lg p-4 text-center">
                  <p className="text-sm text-grey-dark mb-1">Lead Score Avg</p>
                  <p className="text-2xl font-semibold">—</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

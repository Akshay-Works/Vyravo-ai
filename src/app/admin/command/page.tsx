"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const TABS = [
  { v: "priorities", l: "🎯 Priorities" }, { v: "attention", l: "🚨 Attention" },
  { v: "opps", l: "🏆 Opportunities" }, { v: "recs", l: "🧭 Recommendations" },
  { v: "forecast", l: "🔮 Forecast" }, { v: "health", l: "🩺 Health" },
  { v: "summary", l: "📋 Summary" },
];

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const LVL = { HIGH: "border-red-500/40 bg-red-500/5", MED: "border-amber-500/30 bg-amber-500/5", LOW: "border-border bg-surface" } as any;
const LVLIC = { HIGH: "🔴", MED: "🟡", LOW: "⚪" } as any;

function useApi(path: string) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(path).then((r) => r.json()).then((j) => { if (!j.error) setD(j); }).catch(() => {}); }, [path]);
  return d;
}

/* ---------- priorities ---------- */
function PriList({ items }: { items: any[] }) {
  if (!items || items.length === 0) return <p className="py-8 text-center text-sm text-grey-dark">All clear — nothing needs you right now.</p>;
  let lastLvl = "";
  return (
    <div className="space-y-2">
      {items.map((x: any) => {
        const head = x.level !== lastLvl ? ((lastLvl = x.level), true) : false;
        return (
          <div key={x.id}>
            {head && <p className="text-[11px] font-semibold uppercase tracking-wider text-grey-dark pt-2">{x.level === "HIGH" ? "High leverage" : x.level === "MED" ? "Medium" : "Low — only if time"}</p>}
            <div className={`mt-1 rounded-xl border p-3.5 ${LVL[x.level]}`}>
              <p className="text-sm text-zinc-100">{LVLIC[x.level]} {x.title}</p>
              {x.detail && <p className="mt-0.5 text-xs text-grey">{String(x.detail).slice(0, 220)}</p>}
              <p className="mt-1 text-[11px] text-grey-dark">{x.metric}{x.lead_id ? ` · lead #${x.lead_id}` : ""}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrioritiesTab() {
  const d = useApi("/api/admin/activity/priorities");
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Ranking today&apos;s priorities…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-grey-dark">Maximum expected revenue per unit of founder time. Automated follow-ups are never listed as manual work.</p>
      <PriList items={d.items} />
    </div>
  );
}

function AttentionTab() {
  const d = useApi("/api/admin/activity/attention");
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Checking what needs you…</p>;
  if (d.clear) return <p className="py-10 text-center text-sm text-grey-dark">✅ Nothing needs intervention. Automation is handling everything.</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-grey-dark">Check this before starting work. Routine automation is excluded.</p>
      <PriList items={d.items} />
    </div>
  );
}

/* ---------- opportunities ---------- */
function OppsTab() {
  const d = useApi("/api/admin/activity/opportunities");
  const [open, setOpen] = useState<number | null>(null);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Scoring opportunities…</p>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-grey-dark">{d.note}</p>
      {d.leads.map((x: any) => (
        <div key={x.id} className="rounded-xl border border-border bg-surface p-4">
          <button onClick={() => setOpen(open === x.id ? null : x.id)} className="w-full text-left">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-2xl font-semibold font-[var(--font-heading)] ${x.score >= 75 ? "text-green-400" : x.score >= 50 ? "text-amber-400" : "text-grey"}`}>{x.score}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{x.company || `#${x.id}`} <span className="text-grey-dark text-xs">· {x.band}</span></p>
                <p className="text-[11px] text-grey-dark">{x.industry || "—"} · score {x.lead_score ?? "—"}{x.reply_class ? ` · replied (${x.reply_class})` : ""}{x.has_meeting ? " · 📅" : ""}{x.has_proposal ? " · 📄" : ""}</p>
              </div>
              <span className="text-xs text-grey">{open === x.id ? "▲ Why?" : "▼ Why?"}</span>
            </div>
          </button>
          {open === x.id && (
            <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
              {x.factors.map((f: any) => (
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  <span className="w-32 text-grey">{f.label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${Math.round((f.points / f.max) * 100)}%` }} />
                  </div>
                  <span className="w-24 text-right text-grey-dark">{f.level} · {f.points}/{f.max}</span>
                </div>
              ))}
              {x.factors.map((f: any) => <p key={f.label + "r"} className="text-[11px] text-grey-dark">· {f.label}: {f.reason}</p>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- recommendations ---------- */
function RecsTab() {
  const d = useApi("/api/admin/activity/recommend");
  const [why, setWhy] = useState<string | null>(null);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Analyzing segments…</p>;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-2">Recommended focus ({d.period})</h3>
        <p className="text-xs text-grey-dark mb-3">Overall: {d.overall.contacted} contacted · {d.overall.replied} replies · {d.overall.positive} positive</p>
        <div className="space-y-2">
          {d.segments.map((x: any, i: number) => (
            <div key={i} className={`rounded-xl border p-3.5 ${x.verdict === "recommend" ? "border-green-500/30 bg-green-500/5" : "border-border bg-surface"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-100">{x.verdict === "recommend" ? "✅" : "◻️"} {x.dim}: <b>{x.seg}</b></p>
                <button onClick={() => setWhy(why === `s${i}` ? null : `s${i}`)} className="text-[11px] text-primary hover:underline">Why?</button>
              </div>
              <p className="mt-0.5 text-xs text-grey">{x.leads} leads · {x.contacted} contacted · {x.replies} replies · {x.positive} positive · {x.meetings} meetings · rate {x.rate != null ? `${x.rate}%` : "—"} (overall {x.overall_rate != null ? `${x.overall_rate}%` : "—"})</p>
              {why === `s${i}` && <p className="mt-1.5 rounded-lg bg-bg/60 border border-border/60 p-2.5 text-xs text-grey">{x.why} Period: {d.period}. Thresholds: ≥30 contacted + ≥5 replies for a confident call.</p>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-2">Outreach optimization</h3>
        <div className="space-y-2">
          {d.outreach.map((x: any, i: number) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-100">{x.verdict === "recommend" ? "✅" : "◻️"} {x.topic} <span className="text-grey-dark text-xs">· {x.sample}</span></p>
                <button onClick={() => setWhy(why === `o${i}` ? null : `o${i}`)} className="text-[11px] text-primary hover:underline">Why?</button>
              </div>
              <p className="mt-0.5 text-xs text-grey">{x.text}</p>
              {why === `o${i}` && <p className="mt-1.5 rounded-lg bg-bg/60 border border-border/60 p-2.5 text-xs text-grey">{x.why}</p>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-grey-dark">RECOMMENDATION → REVIEW → HUMAN APPROVAL → ACTION. The system never changes strategy by itself.</p>
    </div>
  );
}

/* ---------- forecast ---------- */
function ForecastTab() {
  const d = useApi("/api/admin/activity/forecast");
  const [bn, setBn] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/activity/summary").then((r) => r.json()).then((j) => { if (j.bottleneck) setBn(j.bottleneck); }).catch(() => {}); }, []);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Forecasting…</p>;
  const Box = ({ t, v, sub, tone }: { t: string; v: string; sub: string; tone: string }) => (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className={`text-[11px] uppercase tracking-wider ${tone}`}>{t}</p>
      <p className="text-2xl font-semibold mt-1">{v}</p>
      <p className="mt-0.5 text-[11px] text-grey">{sub}</p>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Box t="Actual · MRR" v={inr(d.actual.mrr)} sub={`invoices paid ${inr(d.actual.invoicesPaid)}`} tone="text-green-400" />
        <Box t="Pipeline" v={inr(d.pipeline.value)} sub={`${d.pipeline.proposals} open proposals · ${d.pipeline.opportunities} opportunities`} tone="text-blue-400" />
        <Box t="Forecast (weighted)" v={d.forecast.weightedPipeline != null ? inr(d.forecast.weightedPipeline) : "—"} sub={d.forecast.verdict === "estimated" ? `win rate ${d.forecast.winRate}%` : "insufficient history"} tone="text-violet-400" />
      </div>
      <p className="text-xs text-grey-dark">{d.forecast.note}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Box t="Meetings (90d)" v={String(d.funnel90d.meetings)} sub="booked" tone="text-grey-dark" />
        <Box t="Proposals (90d)" v={String(d.funnel90d.proposals)} sub="sent" tone="text-grey-dark" />
        <Box t="Won (90d)" v={String(d.funnel90d.won)} sub="accepted" tone="text-grey-dark" />
        <Box t="Target progress" v={`${d.progress}%`} sub={`${inr(d.actual.mrr)} of ${inr(d.target)}`} tone="text-grey-dark" />
      </div>
      {bn && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400">Current bottleneck — {bn.label}</h3>
          <p className="mt-1 text-xs text-grey">{bn.text}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- health ---------- */
const SYS = { healthy: "text-green-400 border-green-500/30", warning: "text-amber-400 border-amber-500/30", failed: "text-red-400 border-red-500/30", unknown: "text-grey border-border" } as any;

function HealthTab() {
  const h = useApi("/api/admin/activity/health");
  const a = useApi("/api/admin/activity/anomalies");
  const q = useApi("/api/admin/activity/quality");
  const [open, setOpen] = useState<string | null>(null);
  const [qopen, setQopen] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-2">Automation health</h3>
        {!h ? <p className="text-xs text-grey-dark">Checking systems…</p> : (
          <div className="grid md:grid-cols-2 gap-2">
            {h.systems.map((s: any) => (
              <div key={s.key} className="rounded-xl border border-border bg-surface p-3.5">
                <button onClick={() => setOpen(open === s.key ? null : s.key)} className="w-full text-left flex items-center justify-between gap-2">
                  <span className="text-sm text-zinc-100">{s.label}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SYS[s.status]}`}>{s.status.toUpperCase()}</span>
                </button>
                <p className="mt-0.5 text-xs text-grey">{s.summary}</p>
                {open === s.key && <div className="mt-2 space-y-1">{s.signals.map((g: any, i: number) => <p key={i} className="text-[11px] text-grey-dark">{g.ok ? "✓" : "✗"} {g.label}: {g.value}</p>)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-2">Anomalies</h3>
        {!a ? <p className="text-xs text-grey-dark">Scanning…</p> : a.anomalies.length === 0 ? (
          <p className="text-xs text-grey-dark">✅ No anomalies — volumes, bounces, queue and ingestion all within normal bands.</p>
        ) : (
          <div className="space-y-2">{a.anomalies.map((x: any, i: number) => (
            <div key={i} className={`rounded-xl border p-3.5 ${x.level === "alert" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <p className="text-sm text-zinc-100">{x.level === "alert" ? "🚨" : "⚠️"} {x.title}</p>
              <p className="mt-0.5 text-xs text-grey">{x.text}</p>
              <p className="mt-1 text-[11px] text-grey-dark">{x.metric}</p>
            </div>))}</div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-2">Data quality</h3>
        {!q ? <p className="text-xs text-grey-dark">Scanning…</p> : (
          <>
            <p className="text-[11px] text-grey-dark mb-2">{q.note}</p>
            <div className="grid md:grid-cols-2 gap-2">
              {q.buckets.map((b: any) => (
                <div key={b.label} className="rounded-xl border border-border bg-surface p-3.5">
                  <button onClick={() => setQopen(qopen === b.label ? null : b.label)} className="w-full text-left flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-100">{b.label}</span>
                    <span className="text-sm font-semibold">{b.count}</span>
                  </button>
                  <p className="mt-0.5 text-[11px] text-grey-dark">{b.note}</p>
                  {qopen === b.label && b.sample.length > 0 && (
                    <div className="mt-2 space-y-0.5">{b.sample.map((s: any, i: number) => <p key={i} className="text-[11px] text-grey-dark">#{s.id} · {String(s.label || "—").slice(0, 50)}{s.n ? ` ×${s.n}` : ""}</p>)}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- summary ---------- */
function SummaryTab() {
  const d = useApi("/api/admin/activity/summary");
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Writing the week up…</p>;
  const m = d.metrics;
  const cells: [string, any][] = [["Leads", m.leads], ["Outreach", m.outreach], ["Follow-ups", m.followups], ["Replies", m.replies], ["Positive", m.positive], ["Meetings", m.meetings], ["Proposals", m.proposals], ["Won", m.won], ["New MRR", inr(d.newMrr)]];
  const Sec = ({ t, items }: { t: string; items: string[] }) => (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-grey mb-2">{t}</h4>
      {items.length === 0 ? <p className="text-xs text-grey-dark">—</p> : items.map((x, i) => <p key={i} className="text-xs text-grey py-0.5">· {x}</p>)}
    </div>
  );
  return (
    <div className="space-y-4">
      <h3 className="font-[var(--font-heading)] text-lg font-semibold">Vyravo AI — Weekly Executive Summary</h3>
      <p className="text-xs text-grey-dark">{d.period}</p>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {cells.map(([l, v]) => <div key={l} className="rounded-lg bg-bg/60 border border-border/60 px-2 py-2 text-center"><p className="text-[10px] text-grey-dark">{l}</p><p className="text-lg font-semibold">{v}</p></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Sec t="What worked" items={d.worked} />
        <Sec t="What didn't" items={d.didnt} />
      </div>
      <Sec t="Biggest bottleneck" items={[`${d.bottleneck.label} — ${d.bottleneck.text}`]} />
      <Sec t="Best-performing ICP" items={[d.bestIcp]} />
      <Sec t="Highest-priority opportunities" items={d.topOpportunities.map((x: any) => `${x.company || `#${x.id}`} — ${x.score}/100 (${x.band})`)} />
      <Sec t="Recommended focus next week" items={[d.focusNextWeek]} />
    </div>
  );
}

/* ---------- page ---------- */
export default function CommandPage() {
  const [tab, setTab] = useState("priorities");
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Command <span className="gradient-text">Center</span></h1>
          <p className="mt-1 text-sm text-grey">What should I focus on? Intelligence only — the human decides.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/activity" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📅 Activity</Link>
          <Link href="/admin/insights" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">💡 Insights</Link>
          <Link href="/admin/analytics" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📊 Analytics</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tab === t.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "priorities" && <PrioritiesTab />}
      {tab === "attention" && <AttentionTab />}
      {tab === "opps" && <OppsTab />}
      {tab === "recs" && <RecsTab />}
      {tab === "forecast" && <ForecastTab />}
      {tab === "health" && <HealthTab />}
      {tab === "summary" && <SummaryTab />}
    </div>
  );
}

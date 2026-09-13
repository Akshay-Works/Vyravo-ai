"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const TABS = [
  { v: "insights", l: "💡 Insights" }, { v: "replies", l: "💬 Replies" },
  { v: "segments", l: "🧩 Segments" }, { v: "outreach", l: "📨 Outreach" },
  { v: "trends", l: "📈 Trends" }, { v: "revenue", l: "💰 Revenue" },
];
const PRESETS = [
  { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" },
  { v: "month", l: "This month" }, { v: "prev-month", l: "Previous month" }, { v: "custom", l: "Custom" },
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Filters = { preset: string; from: string; to: string; industry: string; source: string; country: string; priority: string };

const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function presetRange(p: string): [string, string] {
  const t = new Date();
  if (p === "7d") { const f = new Date(t); f.setDate(f.getDate() - 6); return [dstr(f), dstr(t)]; }
  if (p === "month") return [dstr(t).slice(0, 7) + "-01", dstr(t)];
  if (p === "prev-month") {
    const first = new Date(t.getFullYear(), t.getMonth(), 1);
    const lastPrev = new Date(first.getTime() - 86400000);
    return [`${lastPrev.getFullYear()}-${String(lastPrev.getMonth() + 1).padStart(2, "0")}-01`, dstr(lastPrev)];
  }
  const f = new Date(t); f.setDate(f.getDate() - 29); return [dstr(f), dstr(t)]; // 30d default
}

function qs(f: Filters, extra = ""): string {
  const [pf, pt] = f.preset === "custom" ? [f.from, f.to] : presetRange(f.preset);
  let s = `from=${pf}&to=${pt}`;
  if (f.industry) s += `&industry=${encodeURIComponent(f.industry)}`;
  if (f.source) s += `&source=${encodeURIComponent(f.source)}`;
  if (f.country) s += `&country=${encodeURIComponent(f.country)}`;
  if (f.priority) s += `&priority=${f.priority}`;
  return s + extra;
}

const Rate = ({ v, n, d }: { v: number | null; n: number; d: number }) =>
  v == null ? <span className="text-grey-dark" title={`insufficient data (n=${d})`}>—</span>
    : <span title={`${n}/${d}`}>{v}%</span>;

function Card({ title, value, icon, sub }: { title: string; value: any; icon: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[11px] text-grey-dark uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-2xl font-semibold font-[var(--font-heading)]">{value ?? "—"}</p>
      {sub && <p className="mt-0.5 text-[11px] text-grey">{sub}</p>}
    </div>
  );
}

function Tbl({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-grey-dark">{head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  );
}

/* ================= FILTER BAR ================= */
function FilterBar({ f, setF, options }: { f: Filters; setF: (x: Filters) => void; options: any }) {
  const sel = "rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-white max-w-44";
  return (
    <div className="rounded-xl border border-border bg-surface p-3 flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button key={p.v} onClick={() => setF({ ...f, preset: p.v })}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${f.preset === p.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>{p.l}</button>
      ))}
      {f.preset === "custom" && (
        <span className="flex items-center gap-1 text-xs text-grey">
          <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={sel} />
          → <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={sel} />
        </span>
      )}
      <span className="text-grey-dark text-xs">|</span>
      <select value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className={sel}>
        <option value="">All industries</option>{(options?.industry || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className={sel}>
        <option value="">All sources</option>{(options?.source || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className={sel}>
        <option value="">All countries</option>{(options?.country || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={sel}>
        <option value="">All priorities</option>{["1", "2", "3", "4"].map((o) => <option key={o} value={o}>P{o}</option>)}
      </select>
      {(f.industry || f.source || f.country || f.priority) && (
        <button onClick={() => setF({ ...f, industry: "", source: "", country: "", priority: "" })} className="text-xs text-grey hover:text-white">✕ clear</button>
      )}
    </div>
  );
}

/* ================= TABS ================= */
function InsightsTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/activity/insights").then((r) => r.json()).then((j) => { if (!j.error) setD(j); }).catch(() => {}); }, []);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Analyzing…</p>;
  const style = { good: "border-green-500/30 bg-green-500/5", warn: "border-amber-500/30 bg-amber-500/5", info: "border-blue-500/30 bg-blue-500/5" } as any;
  const icon = { good: "✅", warn: "⚠️", info: "ℹ️" } as any;
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-grey-dark">Data-backed, sample-gated · {d.period} · generated {d.generated_at ? new Date(d.generated_at).toLocaleString("en-IN") : ""}</p>
      {d.insights.length === 0 && <p className="py-8 text-center text-sm text-grey-dark">Collecting data — insights appear once volume grows.</p>}
      {d.insights.map((x: any, i: number) => (
        <div key={i} className={`rounded-xl border p-4 ${style[x.level]}`}>
          <p className="text-sm text-zinc-100">{icon[x.level]} {x.text}</p>
          <p className="mt-1 text-[11px] text-grey-dark">{x.metric} · {x.period}</p>
        </div>
      ))}
    </div>
  );
}

function RepliesTab({ f }: { f: Filters }) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => {
    setD(null);
    try { const r = await fetch(`/api/admin/activity/replies?${qs(f)}`); const j = await r.json(); if (!j.error) setD(j); } catch {}
  }, [f.preset, f.from, f.to, f.industry, f.source, f.country, f.priority]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Loading reply intelligence…</p>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card title="Replies" value={d.activityReplies} icon="💬" sub="received in period" />
        <Card title="Reply rate" value={d.cohort.reply_rate != null ? `${d.cohort.reply_rate}%` : "—"} icon="🎯" sub={`${d.cohort.replied}/${d.cohort.contacted} contacted cohort`} />
        <Card title="Positive" value={d.cohort.positive} icon="⭐" sub={`${d.cohort.positive} of ${d.cohort.replied} replies${d.cohort.positive_rate != null ? ` · ${d.cohort.positive_rate}%` : " · —"}`} />
        <Card title="Contacted" value={d.cohort.contacted} icon="📨" sub="intros sent in period" />
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Classification</h3>
          {d.byClass.length === 0 ? <p className="text-xs text-grey-dark">No replies in this period.</p> : (
            <div className="space-y-2">{d.byClass.map((x: any) => (
              <div key={x.class} className="flex items-center justify-between text-xs">
                <span className="text-grey">{x.label}</span><span className="text-white font-medium">{x.n}</span>
              </div>))}</div>)}
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mt-5 mb-3">Attributed to</h3>
          {d.attribution.length === 0 ? <p className="text-xs text-grey-dark">—</p> : (
            <div className="space-y-2">{d.attribution.map((x: any) => (
              <div key={x.label} className="flex items-center justify-between text-xs">
                <span className="text-grey">{x.label}</span><span className="text-white font-medium">{x.n}</span>
              </div>))}</div>)}
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">By industry / source</h3>
          <Tbl head={["Industry", "Replies", "Positive"]}>
            {d.byIndustry.slice(0, 8).map((x: any) => <tr key={x.seg} className="border-b border-border/60 last:border-0"><td className="p-2 text-zinc-200">{x.seg}</td><td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td></tr>)}
          </Tbl>
          <div className="mt-3"><Tbl head={["Source", "Replies", "Positive"]}>
            {d.bySource.slice(0, 8).map((x: any) => <tr key={x.seg} className="border-b border-border/60 last:border-0"><td className="p-2 text-zinc-200">{x.seg}</td><td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td></tr>)}
          </Tbl></div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Recent replies ({d.recent.length})</h3>
        {d.recent.length === 0 ? <p className="text-xs text-grey-dark">No replies in this period.</p> : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">{d.recent.map((x: any) => (
            <div key={x.id} className="rounded-lg border border-border/60 bg-bg/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-white">{x.business_name || `#${x.id}`}</span>
                <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">{x.label}</span>
                <span className="text-[11px] text-grey-dark">{x.industry || ""} · {x.source || ""} · {x.replied_at ? new Date(x.replied_at).toLocaleString("en-IN", { day: "numeric", month: "short" }) : ""}</span>
              </div>
              {x.text && <p className="mt-1 text-xs text-grey">{x.text.slice(0, 280)}</p>}
            </div>))}</div>)}
      </div>
    </div>
  );
}

function SegTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-grey-dark">No data.</p> : (
        <Tbl head={["Segment", "Leads", "Contacted", "Replies", "Pos", "Meet", "Prop", "Won", "Reply%", "Pos%"]}>
          {rows.map((x: any) => (
            <tr key={x.seg} className="border-b border-border/60 last:border-0">
              <td className="p-2 text-zinc-200 max-w-40 truncate">{x.seg}</td>
              <td className="p-2">{x.leads}</td><td className="p-2">{x.contacted}</td>
              <td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td>
              <td className="p-2">{x.meetings}</td><td className="p-2">{x.proposals}</td><td className="p-2">{x.won}</td>
              <td className="p-2"><Rate v={x.reply_rate} n={x.replies} d={x.contacted} /></td>
              <td className="p-2"><Rate v={x.positive_rate} n={x.positive} d={x.replies} /></td>
            </tr>))}
        </Tbl>)}
    </div>
  );
}

function SegmentsTab({ f, setOptions }: { f: Filters; setOptions: (o: any) => void }) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => {
    setD(null);
    try { const r = await fetch(`/api/admin/activity/segments?${qs(f)}`); const j = await r.json(); if (!j.error) { setD(j); setOptions(j.options); } } catch {}
  }, [f.preset, f.from, f.to, f.industry, f.source, f.country, f.priority]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Loading segments…</p>;
  return (
    <div className="space-y-5">
      <p className="text-xs text-grey-dark">{d.note} “—” = below sample threshold (hover for n).</p>
      <SegTable title="By industry" rows={d.industry} />
      <SegTable title="By lead source" rows={d.source} />
      <div className="grid md:grid-cols-2 gap-5">
        <SegTable title="By country" rows={d.country} />
        <SegTable title="By priority" rows={d.priority} />
      </div>
    </div>
  );
}

function OutreachTab({ f }: { f: Filters }) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => {
    setD(null);
    try { const r = await fetch(`/api/admin/activity/best?${qs(f)}`); const j = await r.json(); if (!j.error) setD(j); } catch {}
  }, [f.preset, f.from, f.to, f.industry, f.source, f.country, f.priority]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Loading outreach analysis…</p>;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">By sequence step</h3>
        <Tbl head={["Step", "Sent", "Replies", "Positive", "Reply%", "Pos%"]}>
          {d.steps.map((x: any) => (
            <tr key={x.step} className="border-b border-border/60 last:border-0">
              <td className="p-2 text-zinc-200">{x.label}</td><td className="p-2">{x.sent}</td>
              <td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td>
              <td className="p-2"><Rate v={x.reply_rate} n={x.replies} d={x.sent} /></td>
              <td className="p-2"><Rate v={x.positive_rate} n={x.positive} d={x.replies} /></td>
            </tr>))}
        </Tbl>
        <p className="mt-2 text-[11px] text-grey-dark">Replies attributed to the latest email sent before the reply. Subjects are per-lead personalized variants of one template per step.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">By send hour (IST)</h3>
          <Tbl head={["Hour", "Sent", "Replied leads", "Rate"]}>
            {d.byHour.map((x: any) => <tr key={x.hour} className="border-b border-border/60 last:border-0"><td className="p-2 text-zinc-200">{x.hour}:00</td><td className="p-2">{x.sent}</td><td className="p-2">{x.replied_leads}</td><td className="p-2"><Rate v={x.reply_rate} n={x.replied_leads} d={x.sent} /></td></tr>)}
          </Tbl>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">By weekday (IST)</h3>
          <Tbl head={["Day", "Sent", "Replied leads", "Rate"]}>
            {d.byDow.map((x: any) => <tr key={x.dow} className="border-b border-border/60 last:border-0"><td className="p-2 text-zinc-200">{DOW[x.dow]}</td><td className="p-2">{x.sent}</td><td className="p-2">{x.replied_leads}</td><td className="p-2"><Rate v={x.reply_rate} n={x.replied_leads} d={x.sent} /></td></tr>)}
          </Tbl>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Top industries by replies</h3>
        <Tbl head={["Industry", "Contacted", "Replies", "Positive", "Reply%", "Pos%"]}>
          {d.byIndustry.map((x: any) => <tr key={x.seg} className="border-b border-border/60 last:border-0"><td className="p-2 text-zinc-200">{x.seg}</td><td className="p-2">{x.contacted}</td><td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td><td className="p-2"><Rate v={x.reply_rate} n={x.replies} d={x.contacted} /></td><td className="p-2"><Rate v={x.positive_rate} n={x.positive} d={x.replies} /></td></tr>)}
        </Tbl>
      </div>
      {d.subjects.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Subjects that got replies</h3>
          {d.subjects.map((x: any, i: number) => (
            <p key={i} className="text-xs text-grey py-1 border-b border-border/60 last:border-0">
              <span className="text-white">{x.business_name}</span> · {x.step === 0 ? "Intro" : `FU${x.step}`} · <span className="text-grey-dark">{String(x.subject || "").slice(0, 70)}</span> · {x.label}
            </p>))}
        </div>
      )}
    </div>
  );
}

function TrendsTab({ f }: { f: Filters }) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => {
    setD(null);
    try {
      const range = f.preset === "custom" ? "custom" : f.preset;
      const r = await fetch(`/api/admin/activity/trends?range=${range}&${qs(f)}`);
      const j = await r.json(); if (!j.error) setD(j);
    } catch {}
  }, [f.preset, f.from, f.to, f.industry, f.source, f.country, f.priority]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Loading trends…</p>;
  const keys: [string, string][] = [["leads", "🧲 Leads"], ["outreach", "📨 Outreach"], ["followups", "🔁 Follow-ups"], ["replies", "💬 Replies"], ["positive", "⭐ Positive"]];
  return (
    <div className="space-y-5">
      <p className="text-xs text-grey-dark">{d.from} → {d.to} (IST) vs previous equivalent period</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {keys.map(([k, label]) => {
          const c = d.compare?.[k] || { current: 0, previous: 0, change: null };
          return (
            <div key={k} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[11px] text-grey-dark uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-semibold mt-1">{c.current}</p>
              <p className="text-[11px] text-grey mt-0.5">prev: {c.previous}</p>
              {c.change != null ? (
                <p className={`text-[11px] mt-0.5 font-medium ${c.change >= 0 ? "text-green-400" : "text-red-400"}`}>{c.change >= 0 ? "↑" : "↓"} {Math.abs(c.change)}%</p>
              ) : <p className="text-[11px] mt-0.5 text-grey-dark">—</p>}
            </div>);
        })}
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Daily series</h3>
        {d.days.length === 0 ? <p className="text-xs text-grey-dark">No activity in range.</p> : (
          <Tbl head={["Date", "Leads", "Outreach", "FU", "Replies", "Pos", "Meet", "Prop", "Won"]}>
            {[...d.days].reverse().slice(0, 45).map((x: any) => (
              <tr key={x.date} className="border-b border-border/60 last:border-0">
                <td className="p-2 text-zinc-200">{x.date.slice(5)}</td><td className="p-2">{x.leads}</td>
                <td className="p-2">{x.outreach}</td><td className="p-2">{x.followups}</td>
                <td className="p-2">{x.replies}</td><td className="p-2">{x.positive}</td>
                <td className="p-2">{x.meetings}</td><td className="p-2">{x.proposals}</td><td className="p-2">{x.won}</td>
              </tr>))}
          </Tbl>)}
      </div>
    </div>
  );
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function RevenueTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/admin/activity/revenue").then((r) => r.json()).then((j) => { if (!j.error) setD(j); }).catch(() => {}); }, []);
  if (!d) return <p className="py-10 text-center text-sm text-grey-dark">Loading revenue…</p>;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey">Target: {inr(d.target)}/month MRR</h3>
          <span className="text-xs text-grey">{d.progress}% there</span>
        </div>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${Math.max(1, Math.min(100, d.progress))}%` }} />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-2">Actual revenue</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card title="Current MRR" value={inr(d.actual.mrr)} icon="💰" sub={`${d.actual.clients} paying clients`} />
          <Card title="New MRR (month)" value={inr(d.actual.newMrrMonth)} icon="📈" />
          <Card title="Invoices paid" value={inr(d.actual.invoicesPaid)} icon="🧾" />
          <Card title="Lifetime value" value={inr(d.actual.lifetime)} icon="🏦" />
        </div>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">Pipeline / potential (not revenue)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card title="Pipeline" value={inr(d.pipeline.openValue)} icon="🔮" sub={`${d.pipeline.openProposals} open proposals`} />
          <Card title="Opportunities" value={d.pipeline.opportunities} icon="🎯" sub="replied / meeting / proposal" />
          <Card title="Proposals" value={d.pipeline.proposals} icon="📄" sub={`${d.pipeline.sent} sent`} />
          <Card title="Won revenue" value={inr(d.won.revenue)} icon="🏆" sub={`${d.won.deals} deals · lost ${inr(d.lost.revenue)}`} />
        </div>
      </div>
      {d.pipeline.list.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Open opportunities</h3>
          <Tbl head={["Company", "Stage", "Potential", "Last activity"]}>
            {d.pipeline.list.map((x: any) => (
              <tr key={x.id} className="border-b border-border/60 last:border-0">
                <td className="p-2 text-zinc-200">{x.business_name || `#${x.id}`}</td>
                <td className="p-2"><span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">{x.stage}</span></td>
                <td className="p-2">{x.potential != null ? inr(x.potential) : "—"}</td>
                <td className="p-2 text-grey">{x.last_activity ? new Date(x.last_activity).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
              </tr>))}
          </Tbl>
        </div>
      )}
      <p className="text-[11px] text-grey-dark">{d.currencyNote} Demo/test clients excluded from revenue. {d.unlinked.meetings} meeting(s) + {d.unlinked.proposals} proposal(s) are not linked to a lead.</p>
    </div>
  );
}

/* ================= PAGE ================= */
export default function InsightsPage() {
  const [tab, setTab] = useState("insights");
  const [options, setOptions] = useState<any>(null);
  const [f, setF] = useState<Filters>({ preset: "30d", from: "", to: "", industry: "", source: "", country: "", priority: "" });
  useEffect(() => {
    fetch("/api/admin/activity/segments?from=2026-01-01&to=2026-01-02").then((r) => r.json()).then((j) => { if (j.options) setOptions(j.options); }).catch(() => {});
  }, []);
  const showFilters = tab !== "insights" && tab !== "revenue";
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Insights <span className="gradient-text">Tier 2</span></h1>
          <p className="mt-1 text-sm text-grey">What&apos;s working, what&apos;s not, where&apos;s the opportunity. Same source of truth as Tier 1.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/activity" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📅 Activity</Link>
          <Link href="/admin/analytics" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📊 Analytics</Link>
          <Link href="/admin/command" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">🎯 Command</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tab === t.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>{t.l}</button>
        ))}
      </div>
      {showFilters && <FilterBar f={f} setF={setF} options={options} />}
      {tab === "insights" && <InsightsTab />}
      {tab === "replies" && <RepliesTab f={f} />}
      {tab === "segments" && <SegmentsTab f={f} setOptions={setOptions} />}
      {tab === "outreach" && <OutreachTab f={f} />}
      {tab === "trends" && <TrendsTab f={f} />}
      {tab === "revenue" && <RevenueTab />}
    </div>
  );
}

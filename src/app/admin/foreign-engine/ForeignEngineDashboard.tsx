"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#14B8A6", "#6366F1", "#D946EF"];

const COUNTRIES = [
  { code: "us", label: "United States" }, { code: "gb", label: "United Kingdom" },
  { code: "au", label: "Australia" }, { code: "ca", label: "Canada" },
  { code: "ae", label: "UAE" }, { code: "sg", label: "Singapore" },
  { code: "nz", label: "New Zealand" }, { code: "ie", label: "Ireland" },
  { code: "de", label: "Germany" }, { code: "nl", label: "Netherlands" },
];
const INDUSTRIES = [
  "real_estate", "legal", "accounting", "insurance", "recruitment", "dental", "medical",
  "home_services", "cleaning", "construction", "roofing", "hvac", "plumbing", "solar",
  "ecommerce", "hospitality", "travel", "automotive", "education", "financial",
  "logistics", "saas", "professional",
];
const SORTS = [
  { v: "score", l: "Highest score" }, { v: "newest", l: "Newest" },
  { v: "country", l: "Country" }, { v: "industry", l: "Industry" }, { v: "verified", l: "Verified email" },
];

const card = (label: string, value: any, sub?: string) => (
  <div key={label} className="rounded-xl border border-border bg-card/60 p-4">
    <div className="text-[11px] uppercase tracking-wide text-grey">{label}</div>
    <div className="mt-1 text-2xl font-semibold">{value ?? 0}</div>
    {sub ? <div className="mt-0.5 text-[11px] text-grey">{sub}</div> : null}
  </div>
);

const rowCls = "text-[12px] px-3 py-2 border-b border-border/50 align-top";

export function ForeignEngineDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [settings, setSettings] = useState<any>(null);
  const [dl, setDL] = useState<any>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("score");
  const [q, setQ] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    const r = await fetch("/api/admin/foreign/stats", { cache: "no-store" });
    if (r.ok) setStats(await r.json());
  }, []);
  const loadRuns = useCallback(async () => {
    const r = await fetch("/api/admin/foreign/runs", { cache: "no-store" });
    if (r.ok) setRuns((await r.json()).runs || []);
  }, []);
  const loadLeads = useCallback(async () => {
    const sp = new URLSearchParams({ ...filters, sort, limit: "100", q });
    const r = await fetch(`/api/admin/foreign/leads?${sp}`, { cache: "no-store" });
    if (r.ok) { const j = await r.json(); setLeads(j.leads || []); setTotal(j.total || 0); setDL(j.facets || []); }
  }, [filters, sort, q]);
  const loadSettings = useCallback(async () => {
    const r = await fetch("/api/admin/foreign/settings", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); setSettings(j.settings); }
  }, []);

  useEffect(() => { loadStats(); loadRuns(); loadSettings(); }, [loadStats, loadRuns, loadSettings]);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  const act = async (label: string, fn: () => Promise<any>) => {
    setBusy(label); setMsg("");
    try { const r = await fn(); if (r && r.ok === false && r.error) setMsg(`${label}: ${r.error}`); else if (r && r.ok && r.dispatched) setMsg(`${label}: dispatched ✔`); else if (r && r.error === undefined) setMsg(`${label}: done`); }
    catch { setMsg(`${label}: failed`); }
    setBusy(""); loadStats(); loadRuns(); loadLeads();
  };

  const saveSettings = async () => {
    setBusy("saving");
    const r = await fetch("/api/admin/foreign/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
    setMsg((await r.json()).ok ? "Settings saved" : "Save failed");
    setBusy(""); loadSettings();
  };

  const exportCsv = () => {
    const sp = new URLSearchParams({ ...filters });
    window.open(`/api/admin/foreign/export?${sp}`, "_blank");
  };

  const facetVals = (key: string) => [...new Set((dl || []).map((f: any) => f[key]).filter(Boolean))].sort();

  // chart data
  const byCountry = (stats?.byCountry || []).map((r: any) => ({ name: r.country || "?", n: r.n }));
  const byIndustry = (stats?.byIndustry || []).map((r: any) => ({ name: (r.industry || "?").replace(/_/g, " "), n: r.n }));
  const pie = [
    { name: "Direct clients", value: stats?.cards?.direct_clients || 0 },
    { name: "White-label agencies", value: stats?.cards?.agencies || 0 },
  ];
  const scoreDist = [
    { name: "HOT (80+)", n: stats?.scoreDist?.hot || 0 },
    { name: "HIGH (60-79)", n: stats?.scoreDist?.high || 0 },
    { name: "MEDIUM (40-59)", n: stats?.scoreDist?.medium || 0 },
    { name: "LOW (<40)", n: stats?.scoreDist?.low || 0 },
  ];
  const series = (stats?.series || []).map((r: any) => ({ d: String(r.d).slice(5), direct: r.direct, agencies: r.agencies }));
  const lastRun = runs[0];
  const c = stats?.cards || {};

  const setF = (k: string, v: string) => setFilters((f) => { const n = { ...f }; if (v) n[k] = v; else delete n[k]; return n; });

  return (
    <div className="p-6 max-w-[1500px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Foreign <span className="gradient-text">Lead Engine</span></h1>
          <p className="mt-1 text-sm text-grey">International B2B prospects — direct clients + white-label agency partners, scored &amp; personalized daily</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => act("Generate", () => fetch("/api/admin/foreign/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "run" }) }).then((r) => r.json()))}
            className="text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10">⚡ Generate Leads Now</button>
          <button onClick={() => act("Test", () => fetch("/api/admin/foreign/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "test" }) }).then((r) => r.json()))}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-grey hover:text-white">🧪 Run Test</button>
          <button onClick={exportCsv} className="text-xs px-3 py-1.5 rounded-lg border border-border text-grey hover:text-white">⬇ Export CSV</button>
          {settings && (
            <button onClick={() => act(settings.paused ? "Resume" : "Pause", () => fetch("/api/admin/foreign/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !settings.paused }) }).then((r) => r.json()))}
              className={`text-xs px-3 py-1.5 rounded-lg border ${settings.paused ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"} hover:bg-white/5`}>
              {settings.paused ? "▶ Resume Engine" : "⏸ Pause Engine"}
            </button>
          )}
          <button onClick={() => act("Clear failed", () => fetch("/api/admin/foreign/runs", { method: "POST" }).then((r) => r.json()))}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-grey hover:text-white">🧹 Clear Failed Jobs</button>
          <button onClick={() => setShowSettings((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-grey hover:text-white">⚙ Settings</button>
        </div>
      </div>
      {busy || msg ? <div className="mt-2 text-xs text-grey">{busy ? `⏳ ${busy}…` : msg}</div> : null}

      {showSettings && settings && (
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-4 grid md:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-grey">Daily direct clients
              <input type="number" min={0} value={settings.dailyDirect} onChange={(e) => setSettings({ ...settings, dailyDirect: +e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-grey">Daily agencies
              <input type="number" min={0} value={settings.dailyAgency} onChange={(e) => setSettings({ ...settings, dailyAgency: +e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-grey">Min lead score
              <input type="number" min={0} max={100} value={settings.minScore} onChange={(e) => setSettings({ ...settings, minScore: +e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm" />
            </label>
            <div className="text-xs text-grey space-y-2 pt-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.requireVerifiedEmail} onChange={(e) => setSettings({ ...settings, requireVerifiedEmail: e.target.checked })} /> Require verified email</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.requireDecisionMaker} onChange={(e) => setSettings({ ...settings, requireDecisionMaker: e.target.checked })} /> Require decision maker</label>
            </div>
          </div>
          <div className="text-xs text-grey">
            <div className="mb-1">Countries</div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.map((c) => (
                <button key={c.code} onClick={() => setSettings((s: any) => ({ ...s, countries: s.countries.includes(c.code) ? s.countries.filter((x: string) => x !== c.code) : [...s.countries, c.code] }))}
                  className={`px-2 py-1 rounded-md border ${settings.countries.includes(c.code) ? "border-primary/40 text-primary bg-primary/10" : "border-border text-grey"}`}>{c.label}</button>
              ))}
            </div>
            <div className="mt-3 mb-1">Industries (empty = all)</div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {INDUSTRIES.map((i) => (
                <button key={i} onClick={() => setSettings((s: any) => ({ ...s, industries: s.industries.includes(i) ? s.industries.filter((x: string) => x !== i) : [...s.industries, i] }))}
                  className={`px-2 py-1 rounded-md border ${(settings.industries || []).includes(i) ? "border-primary/40 text-primary bg-primary/10" : "border-border text-grey"}`}>{i.replace(/_/g, " ")}</button>
              ))}
            </div>
            <button onClick={saveSettings} disabled={busy === "saving"} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/10">Save settings</button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {card("Total leads", c.total)}
        {card("Direct clients", c.direct_clients)}
        {card("White-label agencies", c.agencies)}
        {card("Verified emails", c.verified_emails)}
        {card("Hot (80+)", c.hot)}
        {card("High (60-79)", c.high)}
        {card("Ready for outreach", c.ready_for_outreach)}
        {card("Contacted", c.contacted)}
        {card("Replies", c.replies)}
        {card("Invalid emails removed", c.invalid_emails)}
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Leads over time</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06B6D4" stopOpacity={0.5} /><stop offset="100%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="direct" name="Direct clients" stroke="#3B82F6" fill="url(#gd)" />
              <Area type="monotone" dataKey="agencies" name="Agencies" stroke="#06B6D4" fill="url(#ga)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Direct vs agencies</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" outerRadius={80} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false} fontSize={11}>
                {pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Country distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byCountry}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
              <Bar dataKey="n" name="Leads" fill="#06B6D4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Industry distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byIndustry}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#888" }} angle={-30} height={70} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
              <Bar dataKey="n" name="Leads" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Score distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={scoreDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#888" }} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#111", border: "1px solid #333", fontSize: 12 }} />
              <Bar dataKey="n" name="Leads" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {lastRun && (
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-4 text-xs">
          <div className="text-sm font-medium mb-1">Last engine run</div>
          <div className="text-grey grid sm:grid-cols-4 gap-2">
            <div>{new Date(lastRun.started_at).toLocaleString()}{lastRun.ended_at ? ` → ${new Date(lastRun.ended_at).toLocaleTimeString()}` : ""} · <span className={lastRun.status === "success" ? "text-green-400" : "text-red-400"}>{lastRun.status}</span> · {lastRun.trigger}/{lastRun.mode}</div>
            <div>Discovered {lastRun.leads_discovered} · Qualified {lastRun.leads_qualified}</div>
            <div>Emails {lastRun.emails_found} found / {lastRun.emails_verified} verified · Dupes removed {lastRun.duplicates_removed}</div>
            <div>Saved {lastRun.leads_saved} · Merged {lastRun.leads_merged} · Failed {lastRun.failed} · Errors {lastRun.errors}</div>
          </div>
          {runs.slice(1, 4).map((r) => (
            <div key={r.id} className="text-grey mt-1">{new Date(r.started_at).toLocaleString()} · {r.status} · {r.leads_discovered} discovered · {r.leads_saved} saved</div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="text-sm font-medium mr-2">Leads ({total})</div>
          <select value={filters.type || ""} onChange={(e) => setF("type", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">All types</option><option value="FOREIGN_CLIENT">Direct clients</option><option value="WHITE_LABEL_AGENCY">Agencies</option>
          </select>
          <select value={filters.country || ""} onChange={(e) => setF("country", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">All countries</option>
            {(facetVals("country") || []).map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.city || ""} onChange={(e) => setF("city", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">All cities</option>
            {(facetVals("city") || []).map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filters.industry || ""} onChange={(e) => setF("industry", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">All industries</option>
            {(facetVals("industry") || []).map((v: any) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input type="number" placeholder="Min score" value={filters.minScore || ""} onChange={(e) => setF("minScore", e.target.value)} className="w-20 text-xs rounded-lg border border-border bg-transparent px-2 py-1.5" />
          <select value={filters.emailStatus || ""} onChange={(e) => setF("emailStatus", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">Any email status</option><option value="VERIFIED">VERIFIED</option><option value="LIKELY">LIKELY</option><option value="UNKNOWN">UNKNOWN</option><option value="INVALID">INVALID</option>
          </select>
          <select value={filters.stage || ""} onChange={(e) => setF("stage", e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            <option value="">Any stage</option>
            {["NEW", "QUALIFIED", "READY_FOR_OUTREACH", "CONTACTED", "REPLIED", "CALL_BOOKED", "PROPOSAL", "WON", "LOST", "WHITE_LABEL_PROSPECT", "PARTNERSHIP_CONTACTED", "INTERESTED", "PARTNERSHIP_CALL", "ACTIVE_PARTNER"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-xs rounded-lg border border-border bg-transparent px-2 py-1.5">
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / domain / email…" className="flex-1 min-w-[160px] text-xs rounded-lg border border-border bg-transparent px-2 py-1.5" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-grey">
                <th className="px-3 py-2">Score</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Country / City / Industry</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Decision maker</th>
                <th className="px-3 py-2">Stage</th><th className="px-3 py-2">Discovered</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <FragmentRow key={l.id} l={l} selected={selected === l.id} onToggle={() => setSelected(selected === l.id ? null : l.id)} />
              ))}
            </tbody>
          </table>
          {!leads.length && <div className="text-center text-grey text-xs py-8">No foreign leads yet — press “Generate Leads Now” (or wait for the 05:30 UTC daily run).</div>}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ l, selected, onToggle }: { l: any; selected: boolean; onToggle: () => void }) {
  const drafts = l.outreach_drafts || null;
  const reasons = Array.isArray(l.score_reasons) ? l.score_reasons : [];
  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer hover:bg-white/[0.03] ${selected ? "bg-primary/5" : ""}`}>
        <td className={rowCls}><span className={`px-2 py-0.5 rounded-full text-[11px] ${l.lead_score >= 80 ? "bg-green-500/15 text-green-400" : l.lead_score >= 60 ? "bg-blue-500/15 text-blue-400" : l.lead_score >= 40 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400"}`}>{l.lead_score ?? 0}</span></td>
        <td className={rowCls}>{l.lead_type === "WHITE_LABEL_AGENCY" ? "🤝 Agency" : "🎯 Direct"}</td>
        <td className={rowCls}>
          <div className="font-medium">{l.business_name}</div>
          {l.business_website && <a href={l.business_website} target="_blank" rel="noreferrer" className="text-[11px] text-grey hover:text-primary">{l.business_website}</a>}
        </td>
        <td className={rowCls}>{l.country}{l.city ? ` · ${l.city}` : ""}<div className="text-[11px] text-grey">{(l.industry || "").replace(/_/g, " ")}</div></td>
        <td className={rowCls}>
          {l.email ? <>{l.email}<div className={`text-[11px] ${l.email_verification_status === "VERIFIED" ? "text-green-400" : l.email_verification_status === "LIKELY" ? "text-cyan-400" : l.email_verification_status === "INVALID" ? "text-red-400" : "text-grey"}`}>{l.email_verification_status}</div></> : <span className="text-grey">—</span>}
        </td>
        <td className={rowCls}>{l.first_name ? `${l.first_name} ${l.last_name || ""}${l.job_title ? ` · ${l.job_title}` : ""}` : <span className="text-grey">—</span>}</td>
        <td className={rowCls}>{l.stage?.replace(/_/g, " ")}</td>
        <td className={rowCls}>{l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : ""}</td>
      </tr>
      {selected && (
        <tr><td colSpan={8} className="px-3 py-3 bg-white/[0.02] border-b border-border/50">
          <div className="grid md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-grey uppercase text-[10px] mb-1">Why this lead / agency</div>
              <div>{l.why_this_lead || "—"}</div>
              <div className="text-grey uppercase text-[10px] mt-3 mb-1">Recommended offer</div>
              <div className="text-primary">{l.recommended_offer || "—"}</div>
              {l.partnership_angle && <><div className="text-grey uppercase text-[10px] mt-3 mb-1">Partnership angle</div><div>{l.partnership_angle}</div></>}
              {l.agency_services?.length ? <div className="mt-3 text-grey">Services: {(l.agency_services || []).join(", ")}</div> : null}
              <div className="mt-3 text-grey uppercase text-[10px] mb-1">Why {l.lead_score} ({l.lead_category})</div>
              <ul className="space-y-0.5">{reasons.map((r: string, i: number) => <li key={i}>· {r}</li>)}</ul>
            </div>
            <div>
              {drafts ? (
                <>
                  <div className="text-grey uppercase text-[10px] mb-1">Outreach-ready (pending approval — never auto-sent)</div>
                  <div className="space-y-2">
                    {drafts.subject && <div><span className="text-grey">Subject:</span> {drafts.subject}</div>}
                    {drafts.email && <pre className="whitespace-pre-wrap rounded-lg border border-border/60 p-2 bg-black/20">{drafts.email}</pre>}
                    {drafts.linkedin && <div><span className="text-grey">LinkedIn:</span> {drafts.linkedin}</div>}
                    {drafts.followup1 && <div><span className="text-grey">Follow-up 1:</span> {drafts.followup1}</div>}
                    {drafts.followup2 && <div><span className="text-grey">Follow-up 2:</span> {drafts.followup2}</div>}
                  </div>
                </>
              ) : <div className="text-grey">No outreach drafts (below threshold or not yet enriched).</div>}
              <div className="mt-3 text-grey">Source: {l.source} · Phone: {l.phone || "—"} · LinkedIn: {l.linkedin_url ? <a className="text-primary" href={l.linkedin_url} target="_blank" rel="noreferrer">{l.linkedin_url}</a> : "—"}</div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

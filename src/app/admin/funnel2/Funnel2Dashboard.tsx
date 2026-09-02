"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Lead = {
  id: number;
  company_name: string;
  industry: string | null;
  country: string | null;
  city: string | null;
  website: string | null;
  linkedin_company: string | null;
  decision_maker: string | null;
  job_title: string | null;
  linkedin_profile: string | null;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  lead_score: number;
  score_reasons: string[] | null;
  pain_point: string | null;
  automation_opportunity: string | null;
  recommended_service: string | null;
  reason: string | null;
  contact_confidence: number | null;
  status: string;
  linkedin_ready: boolean;
  email_ready: boolean;
  linkedin_opener: string | null;
  email_opener: string | null;
  notes: string | null;
  date_discovered: string;
  last_contacted_at: string | null;
  follow_up_date: string | null;
};

const STATUSES = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "CALL_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NOT_INTERESTED", "DO_NOT_CONTACT"];

const statusColor = (s: string) =>
  s === "WON" ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s === "DO_NOT_CONTACT" ? "bg-red-500/15 text-red-400 border-red-500/30"
  : s === "REPLIED" || s === "INTERESTED" || s === "CALL_BOOKED" || s === "PROPOSAL_SENT" ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : s === "CONTACTED" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

const scoreColor = (s: number) =>
  s >= 90 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s >= 80 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
  : s >= 70 ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

const queueBadge = (r: { linkedin_ready: boolean; email_ready: boolean }) =>
  r.linkedin_ready && r.email_ready ? { label: "Both", cls: "bg-green-500/15 text-green-400 border-green-500/30" }
  : r.linkedin_ready ? { label: "LinkedIn", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" }
  : r.email_ready ? { label: "Email", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" }
  : { label: "None", cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" };

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function Funnel2Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [facets, setFacets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [f, setF] = useState({ country: "", city: "", industry: "", status: "", minScore: "70", queue: "", hasLinkedin: "", hasEmail: "", q: "" });
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [cfg, setCfg] = useState<any>(null);
  const [cfgForm, setCfgForm] = useState<any>(null);
  const [cfgMsg, setCfgMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (f.country) sp.set("country", f.country);
      if (f.city) sp.set("city", f.city);
      if (f.industry) sp.set("industry", f.industry);
      if (f.status) sp.set("status", f.status);
      if (f.minScore) sp.set("minScore", f.minScore);
      if (f.queue) sp.set("queue", f.queue);
      if (f.hasLinkedin) sp.set("hasLinkedin", "1");
      if (f.hasEmail) sp.set("hasEmail", "1");
      sp.set("limit", "100");
      const r = await fetch(`/api/admin/funnel2/leads?${sp}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setLeads(j.leads || []);
      setStats(j.stats);
      setFacets(j.facets || []);
    } catch (e: any) {
      setError(e.message || " Failed to load");
    } finally {
      setLoading(false);
    }
  }, [f]);

  useEffect(() => { load(); }, [load]);

  const loadCfg = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/funnel2/config`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok) { setCfg(j.config); setCfgForm(j.config); }
    } catch {}
  }, []);
  useEffect(() => { loadCfg(); }, [loadCfg]);

  const patch = useCallback(async (id: number, body: any) => {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/funnel2/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...j.lead } : l)));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusyId(null);
    }
  }, []);

  const saveCfg = useCallback(async () => {
    setCfgMsg("saving…");
    try {
      const payload: any = {
        targetCountries: (cfgForm.targetCountries || []).map((x: string) => x.trim()).filter(Boolean),
        targetCities: (cfgForm.targetCities || []).map((x: string) => x.trim()).filter(Boolean),
        minScore: Number(cfgForm.minScore),
        dailyTarget: Number(cfgForm.dailyTarget),
      };
      if (cfgForm.reportEmail) payload.reportEmail = cfgForm.reportEmail;
      const r = await fetch(`/api/admin/funnel2/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setCfg(j.config); setCfgForm(j.config);
      setCfgMsg("Saved ✔ — next daily run picks it up");
    } catch (e: any) {
      setCfgMsg("Error: " + e.message);
    }
  }, [cfgForm]);

  const countries = useMemo(() => Array.from(new Set(facets.map((x) => x.country).filter(Boolean))).sort(), [facets]);
  const cities = useMemo(() => Array.from(new Set(facets.map((x) => x.city).filter(Boolean))).sort(), [facets]);
  const industries = useMemo(() => Array.from(new Set(facets.map((x) => x.industry).filter(Boolean))).sort(), [facets]);
  const filtered = useMemo(() => leads.filter((l) => {
    if (!f.q) return true;
    const q = f.q.toLowerCase();
    return [l.company_name, l.decision_maker, l.city, l.country, l.email, l.lead_source].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  }), [leads, f.q]);
  const PAGE = 25;
  const rows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const Card = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs uppercase tracking-wider text-grey-dark">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-grey">{sub}</div>}
    </div>
  );

  if (error && !leads.length) {
    return <div className="p-8 text-red-400">Failed to load leads: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] p-4 text-sm text-zinc-200 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Funnel 2 — LinkedIn & Email Leads</h1>
          <p className="text-xs text-grey">Private admin · 70+ scored leads enter outreach queues · never re-contact DO_NOT_CONTACT</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(!showSettings)} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500">
            {showSettings ? "Hide settings" : "⚙ Settings"}
          </button>
          <button onClick={load} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500">↻ Refresh</button>
        </div>
      </div>

      {showSettings && cfg && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Funnel 2 settings (stored in DB, effective next run)</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs text-grey">
              Target countries (comma-separated, empty = all tiers)
              <input className="mt-1 w-full rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-zinc-200" value={(cfgForm.targetCountries || []).join(", ")} onChange={(e) => setCfgForm({ ...cfgForm, targetCountries: e.target.value.split(",") })} />
            </label>
            <label className="block text-xs text-grey">
              Target cities (comma-separated)
              <input className="mt-1 w-full rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-zinc-200" value={(cfgForm.targetCities || []).join(", ")} onChange={(e) => setCfgForm({ ...cfgForm, targetCities: e.target.value.split(",") })} />
            </label>
            <label className="block text-xs text-grey">
              Min score
              <input type="number" className="mt-1 w-full rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-zinc-200" value={cfgForm.minScore} onChange={(e) => setCfgForm({ ...cfgForm, minScore: e.target.value })} />
            </label>
            <label className="block text-xs text-grey">
              Daily target
              <input type="number" className="mt-1 w-full rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-zinc-200" value={cfgForm.dailyTarget} onChange={(e) => setCfgForm({ ...cfgForm, dailyTarget: e.target.value })} />
            </label>
            <label className="block text-xs text-grey">
              Report email
              <input className="mt-1 w-full rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-zinc-200" value={cfgForm.reportEmail || ""} onChange={(e) => setCfgForm({ ...cfgForm, reportEmail: e.target.value })} />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={saveCfg} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Save settings</button>
            {cfgMsg && <span className="text-xs text-grey">{cfgMsg}</span>}
          </div>
        </div>
      )}

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Card label="Total leads" value={stats.total} sub={`${stats.new_today} discovered today`} />
          <Card label="Qualified 70+" value={stats.qualified} sub={`${stats.queue_both ?? 0} Both · ${stats.queue_linkedin ?? 0} LinkedIn · ${stats.queue_email ?? 0} Email`} />
          <Card label="Contacted" value={stats.contacted} sub={`${stats.replies} replies`} />
          <Card label="Calls booked" value={stats.calls_booked} sub={`${stats.won} won`} />
          <Card label="Conversion" value={stats.conversionRate} sub={`${stats.dnc} do-not-contact`} />
        </div>
      )}

      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <select value={f.country} onChange={(e) => { setF({ ...f, country: e.target.value }); setPage(0); }} className="rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.city} onChange={(e) => { setF({ ...f, city: e.target.value }); setPage(0); }} className="rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200">
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.industry} onChange={(e) => { setF({ ...f, industry: e.target.value }); setPage(0); }} className="rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200">
            <option value="">All industries</option>
            {industries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.status} onChange={(e) => { setF({ ...f, status: e.target.value }); setPage(0); }} className="rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" placeholder="Min score" value={f.minScore} onChange={(e) => { setF({ ...f, minScore: e.target.value }); setPage(0); }} className="w-24 rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200" />
          <select value={f.queue} onChange={(e) => { setF({ ...f, queue: e.target.value }); setPage(0); }} className="rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200">
            <option value="">All queues</option>
            <option value="both">Both (Li + Email)</option>
            <option value="linkedin">LinkedIn only</option>
            <option value="email">Email only</option>
            <option value="none">No channel</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-grey">
            <input type="checkbox" checked={f.hasLinkedin === "1"} onChange={(e) => { setF({ ...f, hasLinkedin: e.target.checked ? "1" : "" }); setPage(0); }} /> LinkedIn
          </label>
          <label className="flex items-center gap-1 text-xs text-grey">
            <input type="checkbox" checked={f.hasEmail === "1"} onChange={(e) => { setF({ ...f, hasEmail: e.target.checked ? "1" : "" }); setPage(0); }} /> Email
          </label>
          <input placeholder="Search company / DM / city…" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(0); }} className="min-w-40 rounded-lg border border-border bg-[#0b0e14] px-2 py-1.5 text-xs text-zinc-200" />
          <span className="ml-auto self-center text-xs text-grey-dark">{filtered.length} shown</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
              <th className="p-3">Company</th>
              <th className="p-3">Decision maker</th>
              <th className="p-3">Score</th>
              <th className="p-3">Channels</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top last:border-0 hover:bg-white/[0.02]">
                <td className="max-w-64 p-3">
                  <div className="font-medium text-white">{r.company_name}</div>
                  <div className="text-xs text-grey">{r.industry || "—"} · {[r.city, r.country].filter(Boolean).join(", ") || "—"}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {r.website && <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-blue-400 hover:underline">🌐 site</a>}
                    {r.linkedin_company && <a href={r.linkedin_company.startsWith("http") ? r.linkedin_company : `https://${r.linkedin_company}`} target="_blank" rel="noreferrer" className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-blue-400 hover:underline">in company</a>}
                  </div>
                  {r.pain_point && <div className="pt-1 text-[11px] text-grey">💡 {r.pain_point}</div>}
                  {r.automation_opportunity && <div className="text-[11px] text-grey">⚙ {r.automation_opportunity}</div>}
                  {r.recommended_service && <div className="text-[11px] text-emerald-400/80">→ {r.recommended_service}</div>}
                </td>
                <td className="max-w-56 p-3">
                  {r.decision_maker ? (
                    <>
                      <div className="text-zinc-100">{r.decision_maker}</div>
                      <div className="text-xs text-grey">{r.job_title || ""}{r.contact_confidence ? ` · conf ${r.contact_confidence}/10` : ""}</div>
                    </>
                  ) : <span className="text-xs text-grey-dark">— (no verified DM)</span>}
                  {r.reason && <div className="pt-1 text-[11px] italic text-grey">“{r.reason}”</div>}
                </td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(r.lead_score)}`}>{r.lead_score}</span>
                  {r.lead_score >= 70 && <div className="mt-0.5 text-[10px] text-green-400/80">outreach</div>}
                </td>
                <td className="p-3">
                  {(() => { const q = queueBadge(r); return (
                    <span className={`mb-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${q.cls}`}>{q.label}</span>
                  ); })()}
                  <div className="flex flex-col gap-0.5 text-xs">
                    {r.linkedin_profile ? (
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">in ✓</span>
                        <a href={r.linkedin_profile.startsWith("http") ? r.linkedin_profile : `https://${r.linkedin_profile}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">DM-verified</a>
                      </span>
                    ) : <span className="text-grey-dark">in ✗</span>}
                    {r.email ? (
                      <span className="flex items-center gap-1">
                        <span className="text-green-400">✉</span>
                        <button onClick={() => copy(r.email!)} className="text-blue-400 hover:underline" title="Copy email">{r.email}</button>
                      </span>
                    ) : <span className="text-grey-dark">✉ ✗</span>}
                    {r.phone && <span className="flex items-center gap-1 text-grey"><span>☎</span><button onClick={() => copy(r.phone!)} className="hover:underline">{r.phone}</button></span>}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {r.linkedin_opener && <button onClick={() => copy(r.linkedin_opener!)} title="Copy LinkedIn opener" className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700">LI opener ⧉</button>}
                    {r.email_opener && <button onClick={() => copy(r.email_opener!)} title="Copy email opener" className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700">Email opener ⧉</button>}
                  </div>
                  <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="mt-1 text-[11px] text-grey hover:text-zinc-200">{expanded === r.id ? "− hide" : "+ openers"}</button>
                  {expanded === r.id && (
                    <div className="mt-1 space-y-1 rounded-lg bg-zinc-900/60 p-2 text-[11px]">
                      {r.linkedin_opener && <div><span className="text-grey-dark">LI:</span> {r.linkedin_opener}</div>}
                      {r.email_opener && <div><span className="text-grey-dark">EM:</span> {r.email_opener}</div>}
                      {r.notes && <div><span className="text-grey-dark">Notes:</span> {r.notes}</div>}
                    </div>
                  )}
                </td>
                <td className="p-3">
                  <select value={r.status} disabled={busyId === r.id} onChange={(e) => patch(r.id, { status: e.target.value })} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor(r.status)} bg-transparent`}>
                    {STATUSES.map((s) => <option key={s} value={s} className="bg-[#0b0e14] text-zinc-200">{s}</option>)}
                  </select>
                  {r.last_contacted_at && <div className="mt-0.5 text-[10px] text-grey-dark">last {new Date(r.last_contacted_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.status !== "CONTACTED" && <button onClick={() => patch(r.id, { status: "CONTACTED" })} className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-900/60">Mark contacted</button>}
                    {r.status !== "DO_NOT_CONTACT" && <button onClick={() => { if (confirm(`Block ${r.company_name} permanently?`)) patch(r.id, { status: "DO_NOT_CONTACT" }); }} className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-900/60">DNC</button>}
                    <button onClick={() => { const n = prompt("Add note:", r.notes || ""); if (n !== null) patch(r.id, { notes: n }); }} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700">Note</button>
                    <button onClick={() => { const d = prompt("Follow-up date (YYYY-MM-DD):", r.follow_up_date || ""); if (d !== null) patch(r.id, { follow_up_date: d || null }); }} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700">Follow-up</button>
                  </div>
                </td>
                <td className="p-3 text-xs">
                  <div className="flex flex-col gap-1">
                    {r.website && <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Open website ↗</a>}
                    {r.linkedin_profile && <a href={r.linkedin_profile.startsWith("http") ? r.linkedin_profile : `https://${r.linkedin_profile}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Open LinkedIn ↗</a>}
                    {r.email && <a href={`mailto:${r.email}`} className="text-blue-400 hover:underline">Email them ↗</a>}
                    <span className="text-[10px] text-grey-dark">{r.lead_source || ""}{r.date_discovered ? ` · ${r.date_discovered}` : ""}</span>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} className="p-8 text-center text-grey-dark">No leads match — adjust filters, or wait for the next 9:30 AM run ({new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })})</td></tr>
            )}
            {loading && <tr><td colSpan={6} className="p-8 text-center text-grey-dark">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {filtered.length > PAGE && (
        <div className="mt-3 flex items-center gap-2 text-xs text-grey">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg border border-border bg-surface px-3 py-1 disabled:opacity-40">← Prev</button>
          <span>Page {page + 1} / {Math.ceil(filtered.length / PAGE)}</span>
          <button onClick={() => setPage(Math.min(Math.ceil(filtered.length / PAGE) - 1, page + 1))} disabled={page >= Math.ceil(filtered.length / PAGE) - 1} className="rounded-lg border border-border bg-surface px-3 py-1 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

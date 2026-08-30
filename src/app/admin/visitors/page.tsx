"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type Visit = {
  id: number;
  vid: string;
  vc: number;
  page: string;
  ref: string;
  title: string;
  cc: string;
  city: string;
  device: string;
  browser: string;
  os: string;
  duration_sec: number | null;
  created_at: string;
};

const COLORS = ["#3B82F6", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#14B8A6"];

const dayKey = (iso: string) => iso.slice(0, 10);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function VisitorsPage() {
  const [rows, setRows] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [windowMs, setWindowMs] = useState<"all" | number>("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/visitors?limit=1500");
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Failed to load visitor data"); setLoading(false); return; }
      setRows(d.rows || []);
      setFetchedAt(d.fetchedAt || "");
      setError("");
    } catch {
      setError("Tracker unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const stats = useMemo(() => {
    const now = Date.now();
    const inWin = (iso: string, ms: number) => now - new Date(iso).getTime() <= ms;
    const pick = windowMs === "all" ? rows : rows.filter((r) => inWin(r.created_at, windowMs));
    const unique = (arr: Visit[]) => new Set(arr.map((r) => r.vid)).size;
    const day = dayKey(new Date(now).toISOString());
    const today = rows.filter((r) => dayKey(r.created_at) === day);
    const d7 = rows.filter((r) => inWin(r.created_at, 7 * 864e5));
    const d30 = rows.filter((r) => inWin(r.created_at, 30 * 864e5));

    // 14-day series
    const series: { day: string; visits: number; uniques: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 864e5).toISOString().slice(0, 10);
      const dayRows = rows.filter((r) => dayKey(r.created_at) === d);
      series.push({ day: d.slice(5), visits: dayRows.length, uniques: unique(dayRows) });
    }

    const top = (get: (r: Visit) => string) => {
      const m = new Map<string, number>();
      for (const r of pick) {
        const k = get(r) || "(none)";
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, value]) => ({ name, value }));
    };

    const avgDur = pick.length
      ? Math.round(pick.reduce((a, r) => a + (r.duration_sec || 0), 0) / pick.length)
      : 0;

    return {
      today: today.length, todayUniq: unique(today),
      d7: d7.length, d7Uniq: unique(d7), d30Uniq: unique(d30),
      total: rows.length, totalUniq: unique(rows),
      avgDur,
      series,
      pages: top((r) => r.page), refs: top((r) => r.ref?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]),
      devices: top((r) => r.device), countries: top((r) => [r.cc, r.city].filter(Boolean).join(" — ")),
    };
  }, [rows, windowMs]);

  const recent = useMemo(() => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20), [rows]);

  const kpis = [
    { label: "Visits today", value: stats.today, sub: `${stats.todayUniq} unique` },
    { label: "Visits — 7 days", value: stats.d7, sub: `${stats.d7Uniq} unique` },
    { label: "Unique — 30 days", value: stats.d30Uniq, sub: "" },
    { label: "All time", value: stats.total, sub: `${stats.totalUniq} unique · ~${stats.avgDur}s avg` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Website Visitors</h1>
          <p className="mt-1 text-sm text-grey">
            Live from the visitor tracker (vyravo-tracker) — real traffic on vyravo-ai.vercel.app.
            {fetchedAt && <span className="text-grey-dark"> Updated {fmtDateTime(fetchedAt)}.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={String(windowMs)} onChange={(e) => setWindowMs(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-white">
            <option value="all">All time</option>
            <option value={7 * 864e5}>Last 7 days</option>
            <option value={30 * 864e5}>Last 30 days</option>
          </select>
          <button onClick={load} className="rounded-lg border border-border px-3 py-1.5 text-xs text-white hover:border-primary/50">Refresh</button>
          <a href="https://vyravo-tracker.vercel.app/dashboard" target="_blank" rel="noreferrer"
            className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10">
            Tracker dashboard ↗
          </a>
        </div>
      </div>

      {loading && <div className="rounded-xl border border-border bg-surface p-6 text-grey">Loading visitor data…</div>}
      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
          <p className="mt-1 text-xs text-red-300/70">If this says an env var is missing: add <code>TRACKER_DASHBOARD_KEY</code> to the vyravo-ai project in Vercel (same value as the tracker's DASHBOARD_KEY), then redeploy.</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-wider text-grey-dark">{k.label}</p>
                <p className="mt-1 text-3xl font-semibold font-[var(--font-heading)]">{k.value}</p>
                {k.sub && <p className="mt-1 text-xs text-grey">{k.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 14-day trend */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-grey">Visits — last 14 days</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={stats.series}>
                  <defs>
                    <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="visits" stroke="#3B82F6" fill="url(#gv)" strokeWidth={2} />
                  <Area type="monotone" dataKey="uniques" stroke="#06B6D4" fill="none" strokeWidth={1.5} strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* top pages */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-grey">Top pages</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.pages} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={130} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* devices pie */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-grey">Devices</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats.devices} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                    {stats.devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* referrers */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-grey">Referrers</h2>
              <div className="space-y-2 text-sm">
                {stats.refs.length === 0 && <p className="text-grey">No data.</p>}
                {stats.refs.slice(0, 8).map((r, i) => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="w-7 text-right text-xs text-grey-dark">#{i + 1}</span>
                    <span className="flex-1 truncate text-white">{r.name}</span>
                    <span className="text-xs text-grey">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* recent visits table */}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <h2 className="p-3 text-sm font-semibold uppercase tracking-wider text-grey">Recent visits</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
                  <th className="p-3">Time</th><th className="p-3">Page</th><th className="p-3">Location</th>
                  <th className="p-3">Device</th><th className="p-3">Browser / OS</th><th className="p-3">Dur</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="p-3 whitespace-nowrap text-grey">{fmtDateTime(r.created_at)}</td>
                    <td className="p-3 text-white">{r.page || "—"}</td>
                    <td className="p-3 text-grey">{[r.city, r.cc].filter(Boolean).join(", ") || "—"}</td>
                    <td className="p-3 text-grey capitalize">{r.device}</td>
                    <td className="p-3 text-grey">{r.browser} / {r.os}</td>
                    <td className="p-3 text-grey">{r.duration_sec != null ? `${r.duration_sec}s` : "—"}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={6} className="p-6 text-grey">No visits recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

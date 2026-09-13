"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Counts = { leads: number; outreach: number; followups: number; replies: number; positive: number; meetings: number; won: number };
type CalDay = { date: string; counts: Counts; hasActivity: boolean };

const TABS = [
  { v: "calendar", l: "📅 Calendar" },
  { v: "followups", l: "🔁 Follow-up Monitor" },
  { v: "funnel", l: "🎯 Funnel" },
];
const RANGES = [
  { v: "today", l: "Today" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" },
  { v: "month", l: "This month" }, { v: "custom", l: "Custom" },
];
const WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const fmtDT = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Card({ title, value, icon, sub, alert }: { title: string; value: any; icon: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? "border-red-500/40 bg-red-500/5" : "border-border bg-surface"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[11px] text-grey-dark uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-2xl font-semibold font-[var(--font-heading)]">{value ?? "—"}</p>
      {sub && <p className="mt-0.5 text-[11px] text-grey">{sub}</p>}
    </div>
  );
}

/* ================= CALENDAR ================= */
function CalendarTab() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [days, setDays] = useState<CalDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [dLoading, setDLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/activity/calendar?month=${ym.y}-${String(ym.m).padStart(2, "0")}`);
      const d = await r.json();
      if (d.days) setDays(d.days);
    } catch {} finally { setLoading(false); }
  }, [ym]);
  useEffect(() => { load(); }, [load]);

  const openDay = async (date: string) => {
    setSel(date); setDLoading(true); setDetail(null);
    try {
      const r = await fetch(`/api/admin/activity/day?date=${date}`);
      const d = await r.json();
      if (!d.error) setDetail(d);
    } catch {} finally { setDLoading(false); }
  };

  const shift = (n: number) => {
    let { y, m } = ym; m += n;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    setYm({ y, m }); setSel(null); setDetail(null);
  };
  const monthName = new Date(ym.y, ym.m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const leadBlanks = (new Date(ym.y, ym.m - 1, 1).getDay() + 6) % 7; // Monday-first
  const todayS = dstr(new Date());

  const cellLines = (c: Counts): [string, number][] => {
    const rows: [string, number][] = [];
    if (c.leads) rows.push(["🧲", c.leads]);
    if (c.outreach) rows.push(["📨", c.outreach]);
    if (c.followups) rows.push(["🔁", c.followups]);
    if (c.replies) rows.push(["💬", c.replies]);
    const extra = (c.positive ? 1 : 0) + (c.meetings ? 1 : 0) + (c.won ? 1 : 0);
    if (extra) rows.push(["＋", extra]);
    return rows;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">← Prev</button>
          <h2 className="text-lg font-semibold font-[var(--font-heading)] min-w-44 text-center">{monthName}</h2>
          <button onClick={() => shift(1)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">Next →</button>
        </div>
        <button onClick={() => { const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() + 1 }); setSel(null); setDetail(null); }}
          className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10">Today</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-7 gap-1.5 animate-pulse">{Array.from({ length: 28 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-surface border border-border" />)}</div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-3 md:p-4">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WD.map((w) => <div key={w} className="text-center text-[10px] uppercase tracking-wider text-grey-dark">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((d) => {
              const dd = Number(d.date.slice(8));
              const isToday = d.date === todayS;
              const isSel = d.date === sel;
              return (
                <button key={d.date} onClick={() => openDay(d.date)}
                  className={`min-h-20 md:min-h-24 rounded-lg border p-1.5 text-left align-top transition-colors ${
                    isSel ? "border-primary bg-primary/10" : d.hasActivity ? "border-border bg-bg/60 hover:border-primary/50" : "border-border/40 bg-transparent opacity-45 hover:opacity-80"
                  } ${isToday ? "ring-1 ring-primary/60" : ""}`}>
                  <span className={`text-xs font-medium ${d.hasActivity ? "text-white" : "text-grey-dark"}`}>{dd}</span>
                  <div className="mt-0.5 space-y-px">
                    {cellLines(d.counts).slice(0, 4).map(([ic, n], i) => (
                      <p key={i} className="text-[10px] leading-tight text-grey whitespace-nowrap">{ic} {n}</p>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-grey-dark">🧲 leads · 📨 outreach · 🔁 follow-ups · 💬 replies · ＋ more · all days in IST</p>
        </div>
      )}

      {/* drill-down */}
      {sel && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold font-[var(--font-heading)]">
              {new Date(sel + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            <button onClick={() => { setSel(null); setDetail(null); }} className="text-xs text-grey hover:text-white">✕ Close</button>
          </div>
          {dLoading || !detail ? <p className="py-8 text-center text-sm text-grey-dark">Loading…</p> : <DayDetail d={detail} />}
        </div>
      )}
    </div>
  );
}

function DayDetail({ d }: { d: any }) {
  const c: Counts = d.counts;
  const rows: [string, string, number][] = [
    ["🧲", "Leads", c.leads], ["📨", "Outreach", c.outreach], ["🔁", "Follow-ups", c.followups],
    ["💬", "Replies", c.replies], ["⭐", "Positive*", c.positive], ["📅", "Meetings", c.meetings], ["🏆", "Won", c.won],
  ];
  const Sec = ({ t, items, render, empty }: { t: string; items: any[]; render: (x: any) => React.ReactNode; empty: string }) => (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-grey mb-2">{t} ({items.length})</h4>
      {items.length === 0 ? <p className="text-xs text-grey-dark">{empty}</p> : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">{items.map(render)}</div>
      )}
    </div>
  );
  const Row = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-lg border border-border/60 bg-bg/40 px-3 py-2 text-xs">{children}</div>
  );
  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
        {rows.map(([ic, label, n]) => (
          <div key={label} className="rounded-lg bg-bg/60 border border-border/60 px-2 py-2 text-center">
            <p className="text-[10px] text-grey-dark">{ic} {label}</p>
            <p className="text-xl font-semibold">{n}</p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <Sec t="Leads generated" items={d.leads} empty="No leads generated this day."
          render={(x: any) => <Row key={x.id}><span className="text-white">{x.business_name || `#${x.id}`}</span> <span className="text-grey-dark">· score {x.lead_score ?? "—"} · {x.source}</span></Row>} />
        <Sec t="Replies received" items={d.replies} empty="No replies this day."
          render={(x: any) => <Row key={x.id}><span className="text-emerald-400">💬 {x.business_name}</span>
            {x.after_followup && <span className="ml-1 rounded-full border border-primary/40 px-1.5 text-[10px] text-primary">after FU{x.follow_up_count}</span>}
            {x.latest_reply_subject && <span className="text-grey"> · “{String(x.latest_reply_subject).slice(0, 50)}”</span>}
            {x.latest_reply_preview && <p className="text-grey-dark mt-0.5">{String(x.latest_reply_preview).slice(0, 100)}…</p>}</Row>} />
        <Sec t="Outreach sent" items={d.intros} empty="No intros sent this day."
          render={(x: any) => <Row key={x.id}><span className="text-white">{x.business_name || x.recipient_email}</span> <span className="text-grey-dark">· {fmtDT(x.sent_at)}{x.delivered_at ? " · ✓" : ""}</span><p className="text-grey-dark truncate">{x.subject}</p></Row>} />
        <Sec t="Follow-ups sent" items={d.followups} empty="No follow-ups sent this day."
          render={(x: any) => <Row key={x.id}><span className="rounded-full border border-primary/40 px-1.5 text-[10px] text-primary">FU{x.follow_up_number}</span> <span className="text-white">{x.business_name || x.recipient_email}</span> <span className="text-grey-dark">· {fmtDT(x.sent_at)}{x.delivered_at ? " · ✓" : ""}</span></Row>} />
        <Sec t="Meetings" items={d.meetings} empty="No meetings booked this day."
          render={(x: any) => <Row key={x.id}><span className="text-white">{x.title}</span> <span className="text-grey-dark">· {fmtDT(x.scheduled_at)} · {x.status}</span></Row>} />
        <Sec t="Proposals / wins" items={d.proposals} empty="No proposal movement this day."
          render={(x: any) => <Row key={x.id}><span className="text-white">{x.title || `#${x.id}`}</span> <span className="text-grey-dark">· {x.status}{x.accepted_at ? " · 🏆 won" : ""}</span></Row>} />
      </div>
      <p className="text-[11px] text-grey-dark">* {d.positive_note}</p>
    </div>
  );
}

/* ================= FOLLOW-UP MONITOR ================= */
function FollowupsTab() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/activity/followups");
      const j = await r.json();
      if (!j.error) setD(j);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading || !d) return <p className="py-10 text-center text-sm text-grey-dark">Loading follow-up monitor…</p>;
  const c = d.cards;
  const anomalies = (d.upcoming as any[]).filter((x) => x.anomaly);
  const delivRate = c.sentTotal > 0 ? Math.round((c.delivered / c.sentTotal) * 100) : null;
  const Tbl = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-grey-dark">{head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  );
  return (
    <div className="space-y-5">
      <p className="text-xs text-grey-dark">Monitoring only — follow-ups send automatically (Day {(d.stages || []).join(" / Day ") || "3 / 7"}). No manual sending from this panel.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card title="Sent today" value={c.sentToday} icon="🔁" />
        <Card title="Scheduled" value={c.scheduled} icon="⏳" />
        <Card title="Delivered" value={c.delivered} icon="✓" sub={delivRate != null ? `${delivRate}% of ${c.sentTotal} sent` : `${c.sentTotal} sent`} />
        <Card title="Failed" value={c.failed} icon="⚠️" alert={c.failed > 0} />
        <Card title="Replied after FU" value={c.repliedAfterFu} icon="💬" />
        <Card title="Total FU sent" value={c.sentTotal} icon="📨" />
      </div>

      {d.failed.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <h3 className="text-sm font-semibold text-red-400">⚠️ {d.failed.length} failed follow-up{d.failed.length > 1 ? "s" : ""} need attention</h3>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {d.failed.map((x: any) => (
              <p key={x.id} className="text-xs text-grey">
                <span className={`rounded-full border px-1.5 text-[10px] ${x.kind === "bounced" ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400"}`}>{x.kind}</span>{" "}
                <span className="text-white">{x.business_name || x.recipient_email}</span> · {x.stage} · {fmtDT(x.failed_at)}
                <span className="text-grey-dark"> · {String(x.error_message || "").slice(0, 80)}</span>
              </p>
            ))}
          </div>
        </div>
      )}
      {anomalies.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400">⚠️ {anomalies.length} queued follow-up{anomalies.length > 1 ? "s" : ""} on replied/DNC leads (should auto-cancel)</h3>
          {anomalies.slice(0, 10).map((x: any) => (
            <p key={x.id} className="mt-1 text-xs text-grey">{x.business_name || x.recipient_email} · {x.stage} · lead {x.lead_status}{x.reply_received ? " · replied" : ""}</p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Upcoming / scheduled ({d.upcoming.length})</h3>
        {d.upcoming.length === 0 ? <p className="text-xs text-grey-dark">Nothing scheduled — the automation queues follow-ups as intros send.</p> : (
          <Tbl head={["Prospect", "Stage", "Scheduled", "Queued", "Status"]}>
            {d.upcoming.map((x: any) => (
              <tr key={x.id} className="border-b border-border/60 last:border-0">
                <td className="p-2"><span className="text-zinc-200">{x.business_name || x.full_name || `Lead #${x.lead_id}`}</span><p className="text-grey-dark text-[11px]">{x.recipient_email}</p></td>
                <td className="p-2"><span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">{x.stage} · FU{x.follow_up_number}</span></td>
                <td className="p-2 text-grey">{fmtDT(x.scheduled_for)}</td>
                <td className="p-2 text-grey">{fmtDT(x.queued_at)}</td>
                <td className="p-2">{x.anomaly ? <span className="text-amber-400 text-[11px]">⚠️ check lead</span> : <span className="text-grey-dark text-[11px]">auto · queued</span>}</td>
              </tr>
            ))}
          </Tbl>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-grey mb-3">Recently sent ({d.recent.length})</h3>
        {d.recent.length === 0 ? <p className="text-xs text-grey-dark">No follow-ups sent yet.</p> : (
          <Tbl head={["Prospect", "Stage", "Sent", "Delivered", "Reply after?"]}>
            {d.recent.map((x: any) => (
              <tr key={x.id} className="border-b border-border/60 last:border-0">
                <td className="p-2"><span className="text-zinc-200">{x.business_name || x.full_name || `Lead #${x.lead_id}`}</span><p className="text-grey-dark text-[11px] truncate max-w-56">{x.subject}</p></td>
                <td className="p-2"><span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] text-primary">{x.stage} · FU{x.follow_up_number}</span></td>
                <td className="p-2 text-grey">{fmtDT(x.sent_at)}</td>
                <td className="p-2">{x.delivered_at ? <span className="text-green-400 text-[11px]">✓ {fmtDT(x.delivered_at)}</span> : <span className="text-grey-dark text-[11px]">—</span>}</td>
                <td className="p-2">{x.replied_after ? <span className="text-emerald-400 text-[11px]">💬 replied</span> : <span className="text-grey-dark text-[11px]">—</span>}</td>
              </tr>
            ))}
          </Tbl>
        )}
      </div>
    </div>
  );
}

/* ================= FUNNEL ================= */
function FunnelTab() {
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/admin/activity/funnel?range=${range}`;
      if (range === "custom" && from && to) url += `&from=${from}&to=${to}`;
      if (range === "custom" && (!from || !to)) { setLoading(false); return; }
      const r = await fetch(url);
      const j = await r.json();
      if (!j.error) setD(j);
    } catch {} finally { setLoading(false); }
  }, [range, from, to]);
  useEffect(() => { load(); }, [load]);

  const stages = d?.stages || [];
  const max = stages[0]?.count || 1;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.v} onClick={() => setRange(r.v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${range === r.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>{r.l}</button>
        ))}
        {range === "custom" && (
          <span className="flex items-center gap-2 text-xs text-grey">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-bg px-2 py-1.5 text-white" />
            → <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-bg px-2 py-1.5 text-white" />
          </span>
        )}
      </div>
      {loading || !d ? <p className="py-10 text-center text-sm text-grey-dark">Loading funnel…</p> : (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-grey-dark mb-4">{d.from} → {d.to} (IST) · each stage counts events in range</p>
          {stages.every((s: any) => s.count === 0) ? <p className="py-8 text-center text-sm text-grey-dark">No sales activity in this range.</p> : (
            <div className="space-y-1 max-w-2xl">
              {stages.map((s: any, i: number) => (
                <div key={s.key}>
                  {i > 0 && (
                    <p className="text-center text-[11px] text-grey-dark py-0.5">↓ {s.conv != null ? `${s.conv}%` : "—"}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="w-32 text-right text-xs text-grey">{s.label}{s.proxy ? "*" : ""}</span>
                    <div className="h-7 rounded-lg bg-white/5 overflow-hidden flex-1 flex">
                      <div className="h-full rounded-lg bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${max > 0 ? Math.max(2, Math.round((s.count / max) * 100)) : 2}%` }} />
                    </div>
                    <span className="w-16 text-sm font-medium text-white">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-grey-dark">* Positive = classified positive / interested replies. Won = accepted proposals.</p>
        </div>
      )}
    </div>
  );
}

/* ================= PAGE ================= */
export default function ActivityPage() {
  const [tab, setTab] = useState("calendar");
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Sales Activity</h1>
          <p className="mt-1 text-sm text-grey">Operational control center — calendar, follow-up health, funnel. Read-only; automation untouched.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/analytics" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📊 Analytics</Link>
          <Link href="/admin/insights" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">💡 Insights</Link>
          <Link href="/admin/command" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">🎯 Command</Link>
          <Link href="/admin/outreach" className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white">📨 Outreach</Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${tab === t.v ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>{t.l}</button>
        ))}
      </div>
      {tab === "calendar" && <CalendarTab />}
      {tab === "followups" && <FollowupsTab />}
      {tab === "funnel" && <FunnelTab />}
    </div>
  );
}

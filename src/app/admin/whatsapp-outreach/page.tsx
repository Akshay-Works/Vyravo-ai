"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: number; lead_id: number; follow_up_number: number; channel: string;
  message: string; status: string; personalization_summary: string | null;
  framework: string | null; ai_generated: boolean; provider_message_id: string | null;
  campaign_id: string | null; template_name: string | null; template_language: string | null;
  phone_number: string | null;
  scheduled_at: string | null; queued_at: string | null; approved_at: string | null;
  sent_at: string | null; delivered_at: string | null; read_at: string | null;
  replied_at: string | null; follow_up_date: string | null; error: string | null;
  created_at: string; updated_at: string;
  full_name: string | null; business_name: string | null; industry: string | null;
  lead_score: number | null; phone: string | null; whatsapp_opt_in_status: string | null;
  lead_status: string | null; converted_to_client_id: number | null;
};

type Stats = {
  leadsProcessedToday: number; eligible: number; generated: number;
  awaitingApproval: number; approved: number; queued: number; sent: number;
  delivered: number; read: number; replies: number; replyRate: number;
  followupsGenerated: number; failed: number; optOuts: number;
  callsBooked: number; clients: number; conversionRate: number;
  sentToday: number; dailyLimit: number; deliveredRate: number; readRate: number;
};

type Cfg = {
  enabled: boolean; approval_required: boolean; test_mode: boolean;
  require_opt_in: boolean; daily_limit: number; min_delay_min: number;
  max_per_run: number; follow_up_days: number[]; min_score: number;
  campaign_id: string; emergency_stop: boolean;
};

type Tmpl = { id: number; name: string; provider_name: string; language: string; category: string; purpose: string; variable_count: number; is_active: boolean };

const STATUS_LABEL: Record<string, string> = {
  not_eligible: "Not Eligible", ready: "Ready", message_generated: "Message Generated",
  awaiting_approval: "Awaiting Approval", approved: "Approved", queued: "Queued",
  sent: "Sent", delivered: "Delivered", read: "Read", replied: "Replied",
  follow_up_due: "Follow-Up Due", completed: "Completed", skipped: "Skipped",
  failed: "Failed", opted_out: "Opted Out",
};

const STATUS_STYLE: Record<string, string> = {
  awaiting_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  queued: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  sent: "bg-green-500/15 text-green-400 border-green-500/30",
  delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  read: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  replied: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  follow_up_due: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  skipped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  opted_out: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  completed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const FILTERS = [
  { key: "", label: "All" }, { key: "today", label: "Today" },
  { key: "awaiting_approval", label: "Awaiting Approval" }, { key: "approved", label: "Approved" },
  { key: "queued", label: "Queued" }, { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" }, { key: "read", label: "Read" },
  { key: "replied", label: "Replied" }, { key: "follow_up_due", label: "Follow-Up Due" },
  { key: "failed", label: "Failed" }, { key: "opted_out", label: "Opted Out" },
];

function mask(n: string | null) {
  if (!n) return "—";
  if (n.length < 8) return "***";
  return n.slice(0, 4) + "*".repeat(n.length - 8) + n.slice(-3);
}

function Kpi({ title, value, icon, sub }: { title: string; value: any; icon: string; sub?: string }) {
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

export default function WhatsAppOutreachPage() {
  const [data, setData] = useState<{ stats: Stats; queue: Item[]; config: Cfg; sender: { configured: boolean; simulated: boolean } } | null>(null);
  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<Cfg | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "today" ? "?today=1" : filter ? `?status=${filter}` : "";
      const [d, t] = await Promise.all([
        fetch(`/api/admin/whatsapp${qs}`).then((r) => r.json()),
        fetch("/api/admin/whatsapp/templates").then((r) => r.json()),
      ]);
      if (d.stats) { setData(d); setForm(d.config); }
      if (t.templates) setTemplates(t.templates);
    } catch {} finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, body: any = {}, okMsg?: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/whatsapp/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(d.error || "Action failed");
      else setMsg(d.message || okMsg || "Done ✓");
      await load();
      return d;
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const saveConfig = async () => {
    if (!form) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/whatsapp/config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      setMsg(d.ok ? "Settings saved ✓" : d.error || "Save failed");
      await load();
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const saveTemplate = async (t: Tmpl, patch: Partial<Tmpl>) => {
    await fetch("/api/admin/whatsapp/templates", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, ...patch }),
    });
    await load();
  };

  const emergencyStop = async () => {
    if (!form) return;
    const d = await act(form.emergency_stop ? "resume" : "stop");
    if (d) await load();
  };

  if (loading && !data) return <div className="text-grey py-10">Loading WhatsApp outreach…</div>;
  const cfg = data?.config;
  const stats = data?.stats;
  const testOn = !!cfg?.test_mode;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">WhatsApp Outreach</h1>
          <p className="text-sm text-grey mt-1">
            Daily leads → opt-in gate → personalization → approval queue → official Meta WhatsApp Business API → delivery/read/reply tracking → Day 3 / Day 7 follow-ups.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => act("generate", {}, "Generation complete")} disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50">
            ⚡ Generate Today's WhatsApp Outreach
          </button>
          <button onClick={() => act("simulate")} disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-surface border border-border text-grey hover:text-white disabled:opacity-50">
            🧪 Simulate Send
          </button>
          <button onClick={() => act("followups_run")} disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-surface border border-border text-grey hover:text-white disabled:opacity-50">
            ⏰ Run Follow-ups
          </button>
          <button onClick={emergencyStop} disabled={busy}
            className={`px-3 py-2 rounded-lg text-xs font-medium border disabled:opacity-50 ${cfg?.emergency_stop ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}>
            {cfg?.emergency_stop ? "▶ Resume Outreach" : "⛔ EMERGENCY STOP"}
          </button>
        </div>
      </div>

      {testOn && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <strong>TEST MODE — No WhatsApp messages will be sent.</strong> Messages are generated and queued for review; "Simulate Send" shows what would be sent without touching anything.
        </div>
      )}
      {!data?.sender.configured && !testOn && (
        <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
          <strong>Meta WhatsApp API not configured yet.</strong> Set <code className="text-xs bg-black/30 px-1 rounded">WHATSAPP_ACCESS_TOKEN</code> + <code className="text-xs bg-black/30 px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code> in Vercel to enable real sending. Until then, everything stays queued — nothing is sent.
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi title="Today's leads" value={stats.leadsProcessedToday} icon="🕐" />
          <Kpi title="Generated" value={stats.generated} icon="✍️" />
          <Kpi title="Awaiting approval" value={stats.awaitingApproval} icon="👀" />
          <Kpi title="Sent today" value={stats.sentToday} icon="📤" sub={`limit ${stats.dailyLimit}/day`} />
          <Kpi title="Delivered" value={stats.delivered} icon="✅" sub={`read ${stats.read}`} />
          <Kpi title="Reply rate" value={`${stats.replyRate}%`} icon="💬" sub={`replies ${stats.replies}`} />
          <Kpi title="Failed" value={stats.failed} icon="⚠️" />
          <Kpi title="Follow-ups" value={stats.followupsGenerated} icon="⏰" />
          <Kpi title="Opt-outs" value={stats.optOuts} icon="🚫" />
          <Kpi title="Calls booked" value={stats.callsBooked} icon="📞" />
          <Kpi title="Clients" value={stats.clients} icon="🎯" sub={`${stats.conversionRate}% of sent`} />
        </div>
      )}

      {msg && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">{msg}</div>}

      {/* Settings */}
      {form && (
        <details className="rounded-xl border border-border bg-surface overflow-hidden">
          <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-white/5">⚙️ WhatsApp Outreach Settings</summary>
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-[var(--color-primary)]" /> Sending ON/OFF
            </label>
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.approval_required} onChange={(e) => setForm({ ...form, approval_required: e.target.checked })} className="accent-[var(--color-primary)]" /> Require Approval
            </label>
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.test_mode} onChange={(e) => setForm({ ...form, test_mode: e.target.checked })} className="accent-[var(--color-primary)]" /> Test Mode
            </label>
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.require_opt_in} onChange={(e) => setForm({ ...form, require_opt_in: e.target.checked })} className="accent-[var(--color-primary)]" /> Require Opt-In (safe gate)
            </label>
            <div className="text-sm text-grey">Daily limit:
              <input type="number" value={form.daily_limit} min={0} max={500} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded-md bg-surface border border-border text-white" />
            </div>
            <div className="text-sm text-grey">Min delay (min):
              <input type="number" value={form.min_delay_min} min={0} max={1440} onChange={(e) => setForm({ ...form, min_delay_min: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded-md bg-surface border border-border text-white" />
            </div>
            <div className="text-sm text-grey">Max per run:
              <input type="number" value={form.max_per_run} min={1} max={50} onChange={(e) => setForm({ ...form, max_per_run: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded-md bg-surface border border-border text-white" />
            </div>
            <div className="text-sm text-grey">Min score:
              <input type="number" value={form.min_score} min={0} max={100} onChange={(e) => setForm({ ...form, min_score: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded-md bg-surface border border-border text-white" />
            </div>
            <div className="text-sm text-grey">Follow-up days:
              <input type="text" value={form.follow_up_days.join(", ")} onChange={(e) => setForm({ ...form, follow_up_days: e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => n > 0) })} className="ml-2 w-24 px-2 py-1 rounded-md bg-surface border border-border text-white" placeholder="3, 7" />
            </div>
            <div className="text-sm text-grey">Campaign ID:
              <input type="text" value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })} className="ml-2 w-40 px-2 py-1 rounded-md bg-surface border border-border text-white" />
            </div>
            <div className="col-span-full flex gap-2">
              <button onClick={saveConfig} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50">
                Save settings
              </button>
              <span className="text-xs text-grey self-center">
                API: <strong className={data?.sender.configured ? "text-green-400" : "text-amber-400"}>{data?.sender.configured ? "CONFIGURED" : "NOT CONFIGURED"}</strong>
                {testOn ? " · TEST MODE active" : ""}
              </span>
            </div>
          </div>
        </details>
      )}

      {/* Template registry */}
      <details className="rounded-xl border border-border bg-surface overflow-hidden">
        <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-white/5">📋 WhatsApp Templates (Meta-approved registry)</summary>
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
                <th className="p-2">Local name</th><th className="p-2">Provider name</th><th className="p-2">Lang</th>
                <th className="p-2">Category</th><th className="p-2">Purpose</th><th className="p-2">Vars</th><th className="p-2">Active (approved in Meta)</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="p-2 text-white">{t.name}</td>
                  <td className="p-2 text-grey">{t.provider_name}</td>
                  <td className="p-2 text-grey">{t.language}</td>
                  <td className="p-2 text-grey">{t.category}</td>
                  <td className="p-2 text-grey">{t.purpose}</td>
                  <td className="p-2 text-grey">{t.variable_count}</td>
                  <td className="p-2">
                    <button
                      onClick={() => saveTemplate(t, { is_active: !t.is_active })}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border ${t.is_active ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-zinc-500/15 border-zinc-500/30 text-zinc-400"}`}
                    >
                      {t.is_active ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-grey-dark mt-2">
            Only <strong>active</strong> templates are used for sending. Mark one active per purpose only after the same template name exists and is approved in your Meta WABA.
          </p>
        </div>
      </details>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filter === f.key ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-grey hover:text-white"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="space-y-3">
        {(!data || data.queue.length === 0) && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-grey">
            No items in this view. Run <strong>Generate Today's WhatsApp Outreach</strong> to discover eligible, opted-in leads and create messages.
          </div>
        )}
        {data?.queue.map((it) => (
          <div key={it.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-white">
                  {it.full_name || it.business_name || `Lead #${it.lead_id}`}
                  {it.follow_up_number > 0 && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">Follow-up #{it.follow_up_number}</span>
                  )}
                  {it.ai_generated && <span className="ml-1 text-[10px] text-grey-dark">AI</span>}
                </div>
                <div className="text-xs text-grey mt-0.5">
                  {[it.business_name, it.industry, it.lead_score != null ? `score ${it.lead_score}` : null, `wa ${mask(it.phone_number)}`, `opt-in: ${it.whatsapp_opt_in_status || "unknown"}`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[it.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                {STATUS_LABEL[it.status] || it.status}
              </span>
            </div>

            <div className="rounded-lg bg-bg/60 border border-border/60 p-3 text-sm text-grey whitespace-pre-wrap">{it.message}</div>

            {it.personalization_summary && <div className="text-xs text-grey-dark">💡 <em>{it.personalization_summary}</em></div>}
            {(it.error || it.sent_at) && (
              <div className="text-[11px] text-grey-dark">
                {it.error && <span className="text-red-400">Error: {it.error}</span>}
                {it.error && it.sent_at && " · "}
                {it.sent_at && <span>sent {new Date(it.sent_at).toLocaleString("en-IN")}</span>}
                {it.delivered_at && <span> · delivered {new Date(it.delivered_at).toLocaleString("en-IN")}</span>}
                {it.read_at && <span> · read {new Date(it.read_at).toLocaleString("en-IN")}</span>}
                {it.follow_up_date && <span> · follow-up due {new Date(it.follow_up_date).toLocaleString("en-IN")}</span>}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {it.status === "awaiting_approval" && (
                <>
                  <button onClick={() => act("approve", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 disabled:opacity-50">✅ Approve & Queue</button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">✏️ Edit Message</button>
                  <button onClick={() => act("regenerate", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">🔄 Regenerate</button>
                  <button onClick={() => act("skip", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">⏭ Skip</button>
                  <button onClick={() => act("opt_out", { leadId: it.lead_id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">🚫 Opt Out</button>
                </>
              )}
              {it.status === "queued" && (
                <>
                  <button onClick={() => act("send")} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50">🚀 Send Now</button>
                  <button onClick={() => act("mark_sent", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">✔ Mark as Sent (manual)</button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">✏️ Edit</button>
                  <button onClick={() => act("skip", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">⏭ Skip</button>
                  <button onClick={() => act("opt_out", { leadId: it.lead_id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">🚫 Opt Out</button>
                </>
              )}
              {(it.status === "sent" || it.status === "delivered") && (
                <>
                  <button onClick={() => act("mark_delivered", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">📥 Mark Delivered</button>
                  <button onClick={() => act("mark_read", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">👁 Mark Read</button>
                  <button onClick={() => act("mark_replied", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">💬 Mark Replied</button>
                </>
              )}
              {it.status === "read" && (
                <button onClick={() => act("mark_replied", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">💬 Mark Replied</button>
              )}
              {it.status === "failed" && (
                <>
                  <button onClick={() => act("retry", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50">🔁 Retry</button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">✏️ Edit</button>
                  <button onClick={() => act("skip", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">⏭ Skip</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-xl rounded-xl border border-border bg-surface p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Edit message — {editing.full_name || `lead #${editing.lead_id}`}</h3>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={5}
              className="w-full rounded-lg bg-bg border border-border p-3 text-sm text-white" />
            <div className="text-[11px] text-grey-dark">{editText.length} characters {editText.length > 250 && "(aim ≤ 240 — WhatsApp is short-form)"}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg text-xs border border-border text-grey">Cancel</button>
              <button onClick={async () => { await act("edit", { id: editing.id, message: editText }, "Message updated ✓"); setEditing(null); }} disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

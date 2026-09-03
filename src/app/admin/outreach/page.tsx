"use client";

import { useCallback, useEffect, useState } from "react";

type Event = {
  id: number; lead_id: number;
  recipient_email: string; subject: string;
  status: string; error_message: string | null;
  follow_up_number: number;
  queued_at: string | null; sent_at: string | null; failed_at: string | null;
  delivered_at: string | null;
  test_send: boolean;
  full_name: string | null; business_name: string | null;
  lead_score: number | null; lead_status: string | null;
};

type Stats = {
  todayLeads: number; qualifiedToday: number; generated: number; queued: number;
  sent: number; failed: number; replies: number; followupsDue: number;
  sentToday: number; auto: boolean; test: boolean;
};

type Cfg = {
  auto_outreach: boolean; test_mode: boolean; test_recipient: string;
  daily_limit: number; follow_up_days: number[]; min_gap_secs: number; min_score: number;
};

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

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sent: "bg-green-500/15 text-green-400 border-green-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  skipped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  replied: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function OutreachPage() {
  const [data, setData] = useState<{ stats: Stats; events: Event[]; config: Cfg } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ leadId: number; to: string; replyTo: string; subject: string; html: string; note?: string } | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [editSubject, setEditSubject] = useState("");

  // settings form
  const [form, setForm] = useState<Cfg | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/outreach");
      const d = await r.json();
      if (d.stats) { setData(d); setForm(d.config); }
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (leadId: number, action: string, extra: any = {}, okMsg?: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/outreach/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action, ...extra }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Action failed"); }
      else { if (okMsg) setMsg(okMsg); }
      await load();
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const openPreview = (ev: Event) => {
    setPreview({ leadId: ev.lead_id, to: ev.recipient_email, replyTo: "akshay.navale.work@gmail.com", subject: ev.subject, html: "<p>Loading…</p>" });
    setEditSubject(ev.subject); setEditHtml("");
    // server returns the exact payload that would be sent (test-mode aware)
    fetch("/api/admin/outreach/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: ev.lead_id, action: "preview" }),
    }).then((r) => r.json()).then((d) => {
      if (d.ok) { setPreview({ leadId: ev.lead_id, to: d.to, replyTo: d.replyTo, subject: d.subject, html: d.html, note: d.note }); setEditHtml(d.html); }
    }).catch(() => {});
  };

  const saveConfig = async () => {
    if (!form) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/outreach/config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      setMsg(d.ok ? "Settings saved ✓" : d.error || "Save failed");
      await load();
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const runNow = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/outreach/run?send=1", { method: "POST" });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "Pipeline failed"); }
      else {
        const s = d.sendResult;
        setMsg(`✓ Pipeline: ${d.newQueued} new queued, ${d.followupsScheduled} follow-ups, ${s ? `${s.sent} sent / ${s.failed} failed (today ${d.cfg.dailyLimit} cap)` : "queued only (AUTO OFF)"}`);
      }
      await load();
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const s = data?.stats;
  const events = data?.events || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Outreach Automation</h1>
          <p className="mt-1 text-sm text-grey">
            Daily leads → qualify → personalize → queue → controlled send → track → follow-up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs ${s?.auto ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-border bg-surface text-grey"}`}>
            AUTO {s?.auto ? "ON" : "OFF"}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs ${s?.test ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-border bg-surface text-grey"}`}>
            TEST {s?.test ? "ON" : "OFF"}
          </span>
          <button onClick={runNow} disabled={busy} className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50">
            ⚡ Run pipeline now
          </button>
          <button onClick={load} className="rounded-lg border border-border px-3 py-1.5 text-xs text-grey hover:text-white disabled:opacity-50" disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {msg && <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Today's leads" value={s?.todayLeads} icon="🧲" />
        <Kpi title="Qualified today" value={s?.qualifiedToday} icon="✅" />
        <Kpi title="Emails generated" value={s?.generated} icon="📝" />
        <Kpi title="Queued" value={s?.queued} icon="⏳" />
        <Kpi title="Sent" value={s?.sent} icon="📨" sub={`${s?.sentToday ?? 0} today`} />
        <Kpi title="Failed" value={s?.failed} icon="⚠️" />
        <Kpi title="Replies" value={s?.replies} icon="💬" />
        <Kpi title="Follow-ups due" value={s?.followupsDue} icon="🔁" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        {form && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">Settings</h2>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={form.auto_outreach} onChange={(e) => setForm({ ...form, auto_outreach: e.target.checked })} className="accent-[var(--primary)]" />
                AUTO OUTREACH — queue &amp; send qualified new leads automatically
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={form.test_mode} onChange={(e) => setForm({ ...form, test_mode: e.target.checked })} className="accent-[var(--primary)]" />
                TEST MODE — send everything to the test recipient instead of leads
              </label>
              <div>
                <label className="text-xs text-grey">Test recipient (test mode only)</label>
                <input value={form.test_recipient} onChange={(e) => setForm({ ...form, test_recipient: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-grey">Daily send limit</label>
                  <input type="number" min={0} max={500} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-grey">Follow-up 1 (days)</label>
                  <input type="number" min={0} value={form.follow_up_days[0] ?? 3} onChange={(e) => setForm({ ...form, follow_up_days: [Number(e.target.value), form.follow_up_days[1] ?? 7] })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-grey">Follow-up 2 (days)</label>
                  <input type="number" min={0} value={form.follow_up_days[1] ?? 7} onChange={(e) => setForm({ ...form, follow_up_days: [form.follow_up_days[0] ?? 3, Number(e.target.value)] })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-grey">Min delay between emails (sec)</label>
                  <input type="number" min={0} value={form.min_gap_secs} onChange={(e) => setForm({ ...form, min_gap_secs: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-grey">Min lead score</label>
                  <input type="number" min={0} max={100} value={form.min_score} onChange={(e) => setForm({ ...form, min_score: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <button onClick={saveConfig} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                Save settings
              </button>
              <p className="text-[11px] text-grey-dark">
                Recipient is ALWAYS the lead's CRM email (your address is Reply-To only). Test mode redirects sends to the test recipient.
                Edits to email copy happen in <a href="/admin/email-templates" className="text-primary underline">Email Templates</a> (Outreach — Intro / Follow-up 1 / 2).
              </p>
            </div>
          </div>
        )}

        {/* Events */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">Outreach log</h2>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {events.length === 0 && <p className="py-6 text-center text-sm text-grey-dark">No outreach emails yet — run the pipeline or generate leads first.</p>}
            {events.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-border/60 bg-bg/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{ev.business_name || ev.full_name || `Lead #${ev.lead_id}`}</p>
                    <p className="truncate text-xs text-grey">{ev.recipient_email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[ev.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                    {ev.status}{ev.follow_up_number > 0 ? ` · F${ev.follow_up_number}` : ""}{ev.test_send ? " · TEST" : ""}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-grey-dark">{ev.subject}</p>
                {ev.error_message && <p className="mt-1 truncate text-[11px] text-red-400">{ev.error_message}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button onClick={() => openPreview(ev)} className="rounded border border-border px-2 py-0.5 text-[11px] text-grey hover:text-white">View</button>
                  {ev.status === "queued" && (
                    <>
                      <button onClick={() => act(ev.lead_id, "send_now", {}, "✓ Sent now")} disabled={busy} className="rounded border border-green-500/40 px-2 py-0.5 text-[11px] text-green-400 hover:bg-green-500/10 disabled:opacity-50">Send now</button>
                      <button onClick={() => act(ev.lead_id, "skip", {}, "Skipped")} disabled={busy} className="rounded border border-border px-2 py-0.5 text-[11px] text-grey hover:text-white disabled:opacity-50">Skip</button>
                    </>
                  )}
                  {ev.status === "failed" && (
                    <button onClick={() => act(ev.lead_id, "retry", {}, "Re-queued for retry")} disabled={busy} className="rounded border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">Retry</button>
                  )}
                  {!["sent", "replied"].includes(ev.status) && (
                    <button onClick={() => act(ev.lead_id, "mark_replied", {}, "Marked replied — follow-ups cancelled")} disabled={busy} className="rounded border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">Mark replied</button>
                  )}
                  <button onClick={() => act(ev.lead_id, "dnc", {}, "Marked do-not-contact")} disabled={busy} className="rounded border border-red-500/40 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50">DNC</button>
                </div>
                <p className="mt-1.5 text-[10px] text-grey-dark">
                  {ev.sent_at ? `sent ${new Date(ev.sent_at).toLocaleString("en-IN")}` : ev.failed_at ? `failed ${new Date(ev.failed_at).toLocaleString("en-IN")}` : `queued ${ev.queued_at ? new Date(ev.queued_at).toLocaleString("en-IN") : ""}`}
                  {ev.delivered_at ? ` · delivered ${new Date(ev.delivered_at).toLocaleString("en-IN")}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Preview / edit modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Email preview</h3>
              <button onClick={() => setPreview(null)} className="text-xs text-grey hover:text-white">✕ Close</button>
            </div>
            <div className="mt-3 space-y-0.5 rounded-lg border border-border bg-bg px-3 py-2 text-xs">
              <p><span className="text-grey">To:</span> <span className="text-white">{preview.to}</span></p>
              <p><span className="text-grey">Reply-To:</span> <span className="text-white">{preview.replyTo}</span></p>
              <p><span className="text-grey">Subject:</span> <span className="text-white">{preview.subject}</span></p>
              {preview.note && <p className="text-amber-400">{preview.note}</p>}
            </div>
            <div className="mt-3 rounded-lg border border-border bg-white p-4 text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: preview.html }} />
            {preview.leadId && (
              <>
                <div className="mt-3">
                  <label className="text-xs text-grey">Edit subject (saved to this lead's queued email)</label>
                  <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-grey">Edit HTML body</label>
                  <textarea value={editHtml} onChange={(e) => setEditHtml(e.target.value)} rows={8}
                    className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-white" />
                </div>
                <button onClick={async () => {
                  await act(preview.leadId!, "edit", { subject: editSubject, html: editHtml }, "✓ Email updated");
                  setPreview(null);
                }} disabled={busy} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Save edits
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

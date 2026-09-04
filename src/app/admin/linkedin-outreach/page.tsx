"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: number; lead_id: number; follow_up_number: number; channel: string;
  message: string; status: string; personalization_summary: string | null;
  framework: string | null; ai_generated: boolean; provider_message_id: string | null;
  scheduled_at: string | null; queued_at: string | null; approved_at: string | null;
  sent_at: string | null; replied_at: string | null; follow_up_date: string | null;
  error: string | null; created_at: string; updated_at: string;
  full_name: string | null; business_name: string | null; industry: string | null;
  lead_score: number | null; linkedin_url: string | null; lead_status: string | null;
  converted_to_client_id: number | null;
};

type Stats = {
  leadsProcessedToday: number; generated: number; awaitingApproval: number;
  approved: number; queued: number; sent: number; failed: number; replies: number;
  replyRate: number; followupsGenerated: number; followupsDue: number;
  callsBooked: number; clients: number; conversionRate: number;
  sentToday: number; dailyLimit: number;
};

type Cfg = {
  enabled: boolean; approval_required: boolean; test_mode: boolean;
  daily_limit: number; min_delay_min: number; max_per_run: number;
  follow_up_days: number[]; min_score: number; emergency_stop: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  not_eligible: "Not Eligible", ready: "Ready", message_generated: "Message Generated",
  awaiting_approval: "Awaiting Approval", approved: "Approved", queued: "Queued",
  sent: "Sent", replied: "Replied", follow_up_due: "Follow-Up Due",
  completed: "Completed", skipped: "Skipped", failed: "Failed",
};

const STATUS_STYLE: Record<string, string> = {
  awaiting_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  queued: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  sent: "bg-green-500/15 text-green-400 border-green-500/30",
  replied: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  follow_up_due: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  skipped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  completed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "today", label: "Today" },
  { key: "awaiting_approval", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "follow_up_due", label: "Follow-Up Due" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Skipped" },
];

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

export default function LinkedInOutreachPage() {
  const [data, setData] = useState<{ stats: Stats; queue: Item[]; config: Cfg; sender: { mode: string; simulated: boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<Cfg | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editText, setEditText] = useState("");
  const [showSend, setShowSend] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "today" ? "?today=1" : filter ? `?status=${filter}` : "";
      const r = await fetch(`/api/admin/linkedin${qs}`);
      const d = await r.json();
      if (d.stats) { setData(d); setForm(d.config); }
    } catch {} finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, body: any = {}, okMsg?: string) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/linkedin/action", {
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
      const r = await fetch("/api/admin/linkedin/config", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const d = await r.json();
      setMsg(d.ok ? "Settings saved ✓" : d.error || "Save failed");
      await load();
    } catch { setMsg("Network error"); }
    finally { setBusy(false); }
  };

  const emergencyStop = async () => {
    if (!form) return;
    const d = await act(form.emergency_stop ? "resume" : "stop");
    if (d) await load();
  };

  if (loading && !data) return <div className="text-grey py-10">Loading LinkedIn outreach…</div>;
  const cfg = data?.config;
  const stats = data?.stats;
  const testOn = !!cfg?.test_mode;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">LinkedIn Outreach</h1>
          <p className="text-sm text-grey mt-1">
            Daily lead detection → personalization → approval queue → send → follow-ups (day 3 / day 7).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => act("generate", {}, "Generation complete")}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            ⚡ Generate Today's LinkedIn Outreach
          </button>
          <button
            onClick={() => act("simulate")}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-surface border border-border text-grey hover:text-white disabled:opacity-50"
          >
            🧪 Simulate Send
          </button>
          <button
            onClick={() => act("followups_run")}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-surface border border-border text-grey hover:text-white disabled:opacity-50"
          >
            ⏰ Run Follow-ups
          </button>
          <button
            onClick={emergencyStop}
            disabled={busy}
            className={`px-3 py-2 rounded-lg text-xs font-medium border disabled:opacity-50 ${cfg?.emergency_stop ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-red-500/15 border-red-500/30 text-red-400"}`}
          >
            {cfg?.emergency_stop ? "▶ Resume Outreach" : "⛔ EMERGENCY STOP"}
          </button>
        </div>
      </div>

      {testOn && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <strong>TEST MODE — No LinkedIn messages will be sent.</strong> Messages are generated and queued for review; "Simulate Send" shows what would be sent without touching anything.
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi title="Leads processed today" value={stats.leadsProcessedToday} icon="🕐" />
          <Kpi title="Messages generated" value={stats.generated} icon="✍️" />
          <Kpi title="Awaiting approval" value={stats.awaitingApproval} icon="👀" sub={stats.awaitingApproval ? "ready for your review" : ""} />
          <Kpi title="Queued" value={stats.queued} icon="📥" sub={`${stats.sentToday}/${stats.dailyLimit} sent today`} />
          <Kpi title="Sent" value={stats.sent} icon="📤" sub={`replies: ${stats.replies}`} />
          <Kpi title="Reply rate" value={`${stats.replyRate}%`} icon="💬" sub={`calls booked: ${stats.callsBooked} · clients: ${stats.clients}`} />
          <Kpi title="Failed" value={stats.failed} icon="⚠️" />
          <Kpi title="Follow-ups generated" value={stats.followupsGenerated} icon="⏰" sub={`due now: ${stats.followupsDue}`} />
          <Kpi title="Approved" value={stats.approved} icon="✅" />
          <Kpi title="Conversion rate" value={`${stats.conversionRate}%`} icon="🎯" />
        </div>
      )}

      {/* Settings */}
      {form && (
        <details className="rounded-xl border border-border bg-surface overflow-hidden">
          <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-white/5">⚙️ LinkedIn Outreach Settings</summary>
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-[var(--color-primary)]" />
              Sending ON/OFF
            </label>
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.approval_required} onChange={(e) => setForm({ ...form, approval_required: e.target.checked })} className="accent-[var(--color-primary)]" />
              Require Approval
            </label>
            <label className="flex items-center gap-2 text-sm text-grey">
              <input type="checkbox" checked={form.test_mode} onChange={(e) => setForm({ ...form, test_mode: e.target.checked })} className="accent-[var(--color-primary)]" />
              Test Mode (no real sends)
            </label>
            <div className="text-sm text-grey">Daily limit:
              <input type="number" value={form.daily_limit} min={0} max={200} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded-md bg-surface border border-border text-white" />
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
            <div className="col-span-full flex gap-2">
              <button onClick={saveConfig} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50">
                Save settings
              </button>
              <span className="text-xs text-grey self-center">
                Sender mode: <strong className={data?.sender.mode === "manual" ? "text-amber-400" : "text-green-400"}>{data?.sender.mode === "manual" ? "MANUAL (open profile & send yourself)" : "WEBHOOK GATEWAY"}</strong>
                {testOn ? " · TEST MODE active" : ""}
              </span>
            </div>
          </div>
        </details>
      )}

      {msg && <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary">{msg}</div>}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              filter === f.key ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-grey hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Queue */}
      <div className="space-y-3">
        {(!data || data.queue.length === 0) && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-grey">
            No items in this view. Run <strong>Generate Today's LinkedIn Outreach</strong> to discover eligible leads and create messages.
          </div>
        )}
        {data?.queue.map((it) => (
          <div key={it.id} className="rounded-xl border border-border bg-surface p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-white">
                  {it.full_name || it.business_name || `Lead #${it.lead_id}`}
                  {it.follow_up_number > 0 && (
                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
                      Follow-up #{it.follow_up_number}
                    </span>
                  )}
                  {it.ai_generated && <span className="ml-1 text-[10px] text-grey-dark">AI</span>}
                </div>
                <div className="text-xs text-grey mt-0.5">
                  {[it.business_name, it.industry, it.lead_score != null ? `score ${it.lead_score}` : null].filter(Boolean).join(" · ") || "—"}
                  {it.linkedin_url && (
                    <>
                      {" · "}
                      <a href={`https://${String(it.linkedin_url).replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        LinkedIn profile ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[it.status] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
                {STATUS_LABEL[it.status] || it.status}
              </span>
            </div>

            <div className="rounded-lg bg-bg/60 border border-border/60 p-3 text-sm text-grey whitespace-pre-wrap">
              {it.message}
            </div>

            {it.personalization_summary && (
              <div className="text-xs text-grey-dark">💡 <em>{it.personalization_summary}</em></div>
            )}
            {(it.error || it.follow_up_date || it.sent_at) && (
              <div className="text-[11px] text-grey-dark">
                {it.error && <span className="text-red-400">Error: {it.error}</span>}
                {it.error && it.sent_at && " · "}
                {it.sent_at && <span>sent {new Date(it.sent_at).toLocaleString("en-IN")}</span>}
                {it.follow_up_date && <span> · follow-up due {new Date(it.follow_up_date).toLocaleString("en-IN")}</span>}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {it.status === "awaiting_approval" && (
                <>
                  <button onClick={() => act("approve", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 disabled:opacity-50">
                    ✅ Approve & Queue
                  </button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ✏️ Edit Message
                  </button>
                  <button onClick={() => act("regenerate", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    🔄 Regenerate
                  </button>
                  <button onClick={() => act("skip", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ⏭ Skip
                  </button>
                </>
              )}
              {it.status === "queued" && (
                <>
                  <button onClick={() => { setShowSend(it); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-50">
                    🚀 Send Now
                  </button>
                  <button onClick={() => act("mark_sent", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ✔ Mark as Sent (manual)
                  </button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ✏️ Edit
                  </button>
                  <button onClick={() => act("skip", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ⏭ Skip
                  </button>
                </>
              )}
              {(it.status === "sent" || it.status === "queued") && (
                <button onClick={() => act("mark_replied", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                  💬 Mark Replied
                </button>
              )}
              {it.status === "failed" && (
                <>
                  <button onClick={() => act("retry", { id: it.id })} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50">
                    🔁 Retry
                  </button>
                  <button onClick={() => { setEditing(it); setEditText(it.message); }} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-border text-grey hover:text-white disabled:opacity-50">
                    ✏️ Edit
                  </button>
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
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={6}
              className="w-full rounded-lg bg-bg border border-border p-3 text-sm text-white"
            />
            <div className="text-[11px] text-grey-dark">{editText.length} characters {editText.length > 300 && "(aim ≤ 250 for intros)"}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg text-xs border border-border text-grey">Cancel</button>
              <button
                onClick={async () => { await act("edit", { id: editing.id, message: editText }, "Message updated ✓"); setEditing(null); }}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send modal */}
      {showSend && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSend(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Send to {showSend.full_name || `lead #${showSend.lead_id}`}</h3>
            {data?.sender.mode === "manual" ? (
              <>
                <p className="text-sm text-grey">
                  No LinkedIn sender integration is configured, so this message stays in your hands:
                </p>
                <ol className="text-sm text-grey list-decimal pl-5 space-y-1">
                  <li>
                    Open the lead's profile:{" "}
                    <a href={`https://${String(showSend.linkedin_url).replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {showSend.linkedin_url} ↗
                    </a>
                  </li>
                  <li>Send/connect with the message below (copy-paste).</li>
                  <li>Come back and press <strong>Mark as Sent</strong> so follow-ups are tracked.</li>
                </ol>
              </>
            ) : (
              <p className="text-sm text-grey">
                A LinkedIn send gateway is configured — press send and the gateway delivers this to <strong>{showSend.linkedin_url}</strong>. The recipient always comes from the CRM lead record.
              </p>
            )}
            <div className="rounded-lg bg-bg/60 border border-border/60 p-3 text-sm text-grey whitespace-pre-wrap">{showSend.message}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSend(null)} className="px-3 py-2 rounded-lg text-xs border border-border text-grey">Close</button>
              <button
                onClick={async () => {
                  if (data?.sender.mode === "manual") {
                    try { await navigator.clipboard.writeText(showSend.message); } catch {}
                    await act("mark_sent", { id: showSend.id }, "Message copied — marked as sent ✓");
                  } else {
                    await act("send");
                  }
                  setShowSend(null);
                }}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-primary/15 border border-primary/30 text-primary disabled:opacity-50"
              >
                {data?.sender.mode === "manual" ? "Copy & Mark Sent" : "Send via gateway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

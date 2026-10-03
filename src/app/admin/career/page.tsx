"use client";

import { useEffect, useState } from "react";

const TABS = ["overview", "jobs", "approvals", "tracker", "resume", "settings", "logs"] as const;
type Tab = (typeof TABS)[number];

async function get(tab: string, extra = "") {
  const r = await fetch(`/api/admin/career?tab=${tab}${extra}`);
  return r.json();
}
async function post(body: any) {
  const r = await fetch("/api/admin/career", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "failed");
  return j;
}

function Kpi({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-[11px] text-grey">{label}</div>
      <div className="font-[var(--font-heading)] text-2xl font-bold">{value ?? 0}</div>
      {sub && <div className="text-[11px] text-grey-dark">{sub}</div>}
    </div>
  );
}

export default function CareerPilotPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [d, setD] = useState<any>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [job, setJob] = useState<any>(null);
  const [docBody, setDocBody] = useState("");

  const load = async (t: Tab) => {
    const j = await get(t === "resume" || t === "settings" ? "profile" : t === "approvals" || t === "tracker" ? "apps" : t,
      t === "approvals" ? "&status=awaiting_approval" : t === "jobs" && q ? `&q=${encodeURIComponent(q)}` : "");
    if (j.ok) setD(j);
  };
  useEffect(() => { load(tab).catch(() => {}); }, [tab]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setMsg(""); setBusy(true);
    try { await fn(); setMsg("✅ " + ok); await load(tab); }
    catch (e: any) { setMsg("❌ " + (e.message || "failed")); }
    finally { setBusy(false); }
  };

  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-[var(--font-heading)] text-xl font-bold">🧭 CareerPilot AI</h1>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">Founder-only · review-first · no auto-apply</span>
        <button disabled={busy} onClick={() => act(() => post({ action: "run_now" }), "search finished")}
          className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Run search now</button>
      </div>
      {msg && <p className="text-xs">{msg}</p>}
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setJob(null); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${tab === t ? "bg-primary text-white" : "bg-surface-2 text-grey"}`}>{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <p className="text-xs text-grey">
            Daily discovery uses <b>RemoteOK, Remotive, Arbeitnow</b> public APIs (no LinkedIn/Naukri scrape).
            LinkedIn/Naukri/Indeed auto-apply is <b>not connected</b>. Salary min and joining date stay blank until you set them.
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-5">
            <Kpi label="Discovered today" value={d.today?.discovered_today} />
            <Kpi label="This week" value={d.today?.week} />
            <Kpi label="Shortlisted" value={d.today?.shortlisted} />
            <Kpi label="Awaiting your approval" value={d.apps?.pending_approval} />
            <Kpi label="Submitted (you confirmed)" value={d.apps?.submitted} />
            <Kpi label="Follow-ups due" value={d.apps?.followups_due} />
            <Kpi label="Interviews" value={d.apps?.interviews} />
            <Kpi label="Offers" value={d.apps?.offers} />
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 text-xs text-grey">
            Last search: {d.lastOk ? `${d.lastOk.status} · ${new Date(d.lastOk.completed_at || d.lastOk.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · inserted ${d.lastOk.discovered} · dupes ${d.lastOk.duplicates}` : "none yet — press Run search now"}
            {d.profile && !d.profile.approved_at && <p className="mt-1 text-amber-400">Master profile not yet approved — open Resume tab.</p>}
            {d.prefs && d.prefs.min_monthly_inr == null && <p className="mt-1">Minimum salary is unset — jobs are not filtered on pay.</p>}
          </div>
        </>
      )}

      {tab === "jobs" && (
        <>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / company" className={input} />
            <button onClick={() => load("jobs")} className="rounded-lg bg-surface-2 px-3 text-xs">Search</button>
          </div>
          <div className="overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-surface text-[11px] uppercase text-grey-dark">
                <tr><th className="p-2">Score</th><th className="p-2">Role</th><th className="p-2">Location</th><th className="p-2">Source</th><th className="p-2">Status</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(d.rows || []).map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 font-bold">{r.match_score ?? "—"}</td>
                    <td className="p-2"><div className="font-semibold">{r.title}</div><div className="text-grey">{r.company}</div></td>
                    <td className="p-2">{r.location} · {r.work_mode}</td>
                    <td className="p-2">{r.source}</td>
                    <td className="p-2">{r.status}{r.shortlisted ? " ★" : ""}</td>
                    <td className="p-2 whitespace-nowrap">
                      <button className="text-primary" onClick={async () => { const j = await get("job", `&id=${r.id}`); if (j.ok) setJob(j.job); }}>Details</button>
                      {" · "}
                      <a className="text-primary" href={r.apply_url} target="_blank" rel="noreferrer">Official ↗</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(d.rows || []).length === 0 && <p className="p-4 text-center text-grey">No jobs yet — run a search.</p>}
          </div>
          {job && (
            <div className="space-y-2 rounded-xl border border-primary/40 bg-surface p-4 text-xs">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">{job.title} · {job.company}</div>
                  <div className="text-grey">Match {job.match_score} · {job.location} · {job.salary_text || "salary undisclosed"}</div>
                </div>
                <button onClick={() => setJob(null)} className="text-grey">Close</button>
              </div>
              <p className="text-grey">{job.match_reasons}</p>
              {job.concerns && <p className="text-amber-400">Concerns: {job.concerns}</p>}
              <p className="max-h-40 overflow-auto whitespace-pre-wrap text-grey-dark">{String(job.description || "").replace(/<[^>]+>/g, " ").slice(0, 2500)}</p>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => act(() => post({ action: "shortlist", jobId: job.id, on: !job.shortlisted }), "updated")} className="rounded bg-surface-2 px-2 py-1">{job.shortlisted ? "Unshortlist" : "Shortlist"}</button>
                <button disabled={busy} onClick={() => act(() => post({ action: "generate_docs", jobId: job.id }), "docs generated")} className="rounded bg-surface-2 px-2 py-1">Generate docs</button>
                <a className="rounded bg-primary px-2 py-1 font-semibold" href={job.apply_url} target="_blank" rel="noreferrer">Open official apply ↗</a>
              </div>
            </div>
          )}
        </>
      )}

      {(tab === "approvals" || tab === "tracker") && (
        <div className="space-y-2">
          {(d.rows || []).map((a: any) => (
            <div key={a.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <b>{a.title}</b> <span className="text-grey">{a.company} · score {a.match_score}</span>
                <span className="rounded bg-surface-2 px-2 py-0.5">{a.status}</span>
                <a className="ml-auto text-primary" href={a.apply_url} target="_blank" rel="noreferrer">Official ↗</a>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {tab === "approvals" && (
                  <>
                    <button disabled={busy} onClick={() => act(() => post({ action: "status", id: a.id, status: "approved" }), "approved")} className="rounded bg-emerald-700 px-2 py-1">Approve</button>
                    <button disabled={busy} onClick={() => act(() => post({ action: "status", id: a.id, status: "rejected" }), "rejected")} className="rounded bg-surface-2 px-2 py-1">Reject</button>
                  </>
                )}
                <button disabled={busy} onClick={() => act(() => post({ action: "mark_applied", id: a.id }), "recorded as submitted")} className="rounded bg-primary px-2 py-1">I applied on the official site</button>
                <button disabled={busy} onClick={() => act(() => post({ action: "status", id: a.id, status: "interview_scheduled" }), "interview")} className="rounded bg-surface-2 px-2 py-1">Interview</button>
                <button disabled={busy} onClick={() => act(() => post({ action: "status", id: a.id, status: "withdrawn" }), "withdrawn")} className="rounded bg-surface-2 px-2 py-1">Withdraw</button>
                <button onClick={async () => { const j = await get("docs", `&jobId=${a.job_id}`); setDocBody((j.rows || []).map((x: any) => `--- ${x.kind} v${x.version} ---\n${x.body}`).join("\n\n")); }} className="rounded bg-surface-2 px-2 py-1">View docs</button>
              </div>
            </div>
          ))}
          {(d.rows || []).length === 0 && <p className="text-sm text-grey">Nothing here yet.</p>}
          {docBody && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-3 text-[11px]">{docBody}</pre>}
        </div>
      )}

      {tab === "resume" && d.profile && (
        <div className="space-y-2">
          <p className="text-xs text-grey">Verified from your uploaded resumes. Approve after you check it. Unknown salary / notice period are listed as missing — not invented.</p>
          <div className="grid gap-2 md:grid-cols-2">
            <input className={input} defaultValue={d.profile.full_name} id="nm" />
            <input className={input} defaultValue={d.profile.headline} id="hd" />
          </div>
          <textarea id="sm" className={input} rows={4} defaultValue={d.profile.summary} />
          <textarea id="mr" className={input} rows={12} defaultValue={d.profile.master_resume} />
          <p className="text-[11px] text-amber-400">Missing: {(d.profile.missing_fields || []).join(" · ") || "—"}</p>
          <button disabled={busy} onClick={() => act(() => post({
            action: "save_profile",
            full_name: (document.getElementById("nm") as HTMLInputElement).value,
            headline: (document.getElementById("hd") as HTMLInputElement).value,
            summary: (document.getElementById("sm") as HTMLTextAreaElement).value,
            master_resume: (document.getElementById("mr") as HTMLTextAreaElement).value,
            approve: true,
          }), "profile saved & approved")} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">Save & approve profile</button>
        </div>
      )}

      {tab === "settings" && d.prefs && (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-xs text-grey">Min monthly INR (blank = don’t filter)
            <input id="minp" className={input} defaultValue={d.prefs.min_monthly_inr ?? ""} placeholder="not set" />
          </label>
          <label className="text-xs text-grey">Preferred annual CTC INR (blank = don’t invent)
            <input id="ctc" className={input} defaultValue={d.prefs.preferred_ctc_inr ?? ""} placeholder="not set" />
          </label>
          <label className="text-xs text-grey">Notice / joining
            <input id="np" className={input} defaultValue={d.prefs.notice_period} placeholder="e.g. immediate / 30 days" />
          </label>
          <label className="text-xs text-grey">Daily package target
            <input id="tgt" className={input} defaultValue={d.prefs.daily_application_target} />
          </label>
          <label className="text-xs text-grey md:col-span-2">Report email (blank = don’t send)
            <input id="em" className={input} defaultValue={d.prefs.report_email} placeholder="you@email" />
          </label>
          <p className="md:col-span-2 text-[11px] text-grey">Approval mode is locked to <b>review first</b>. Auto-submit stays off until a permitted apply API exists (none connected).</p>
          <button disabled={busy} onClick={() => act(() => post({
            action: "save_prefs",
            min_monthly_inr: (document.getElementById("minp") as HTMLInputElement).value || null,
            preferred_ctc_inr: (document.getElementById("ctc") as HTMLInputElement).value || null,
            notice_period: (document.getElementById("np") as HTMLInputElement).value,
            daily_application_target: Number((document.getElementById("tgt") as HTMLInputElement).value),
            report_email: (document.getElementById("em") as HTMLInputElement).value,
          }), "preferences saved")} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">Save preferences</button>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-2 text-xs">
          <h2 className="font-semibold">Search runs</h2>
          {(d.runs || []).map((r: any) => (
            <p key={r.id} className="rounded bg-surface-2 p-2">{new Date(r.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {r.status} · found {r.discovered} · dupes {r.duplicates} · {r.errors || JSON.stringify(r.sources).slice(0, 180)}</p>
          ))}
          <h2 className="font-semibold">Activity</h2>
          {(d.rows || []).map((r: any) => (
            <p key={r.id} className="text-grey">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {r.action} · {r.object} {r.object_id}</p>
          ))}
        </div>
      )}
    </div>
  );
}

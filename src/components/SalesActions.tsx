"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OUTCOMES = ["connected", "interested", "no_answer", "busy", "callback_requested", "meeting_booked", "qualified", "not_interested", "wrong_number", "lost"];
const STAGES = ["qualified", "meeting_booked", "proposal_sent", "negotiation", "won", "nurture", "no_response", "not_interested", "lost"];

async function patch(leadId: number, body: any) {
  const r = await fetch(`/api/sales/leads/${leadId}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "failed");
  return j;
}

export default function SalesActions({ leadId, admin }: { leadId: number; admin: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"call" | "note" | "stage" | "task">("call");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("connected");
  const [notes, setNotes] = useState("");
  const [nextFU, setNextFU] = useState("");
  const [stage, setStage] = useState("qualified");
  const [reason, setReason] = useState("");
  const [taskKind, setTaskKind] = useState("followup");
  const [taskDue, setTaskDue] = useState("");

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    if (busy) return;
    setBusy(true); setMsg("");
    try { await fn(); setMsg("✅ " + okMsg); setNotes(""); setReason(""); router.refresh(); }
    catch (e: any) { setMsg("❌ " + (e.message || "failed")); }
    setBusy(false);
  };

  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex gap-1">
        {(["call", "note", "stage", "task"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-primary text-white" : "bg-surface-2 text-grey"}`}>
            {t === "call" ? "📞 Log call" : t === "note" ? "📝 Note" : t === "stage" ? "🔀 Stage" : "📌 Task"}
          </button>
        ))}
      </div>

      {tab === "call" && (
        <div className="space-y-2">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={input}>
            {OUTCOMES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </select>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes…" rows={2} className={input} />
          <input type="datetime-local" value={nextFU} onChange={(e) => setNextFU(e.target.value)} className={input} />
          <button disabled={busy} onClick={() => run(() => patch(leadId, { action: "call", outcome, notes, nextFollowUp: nextFU || null }), "call logged")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Save call</button>
        </div>
      )}
      {tab === "note" && (
        <div className="space-y-2">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note…" rows={3} className={input} />
          <button disabled={busy} onClick={() => run(() => patch(leadId, { action: "note", note: notes }), "note added")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Add note</button>
        </div>
      )}
      {tab === "stage" && (
        <div className="space-y-2">
          <select value={stage} onChange={(e) => setStage(e.target.value)} className={input}>
            {STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}{s === "won" ? " (→ admin confirms)" : ""}</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={input} />
          <button disabled={busy} onClick={() => run(() => patch(leadId, { action: "stage", to: stage, reason }), "stage updated")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Move stage</button>
          {admin && <p className="text-[11px] text-grey-dark">Admin: moves run through the same lifecycle engine + audit.</p>}
        </div>
      )}
      {tab === "task" && (
        <div className="space-y-2">
          <select value={taskKind} onChange={(e) => setTaskKind(e.target.value)} className={input}>
            <option value="call">📞 Call</option>
            <option value="followup">📌 Follow-up</option>
            <option value="meeting_prep">📅 Meeting prep</option>
          </select>
          <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={input} />
          <button disabled={busy} onClick={() => run(() => patch(leadId, { action: "task", kind: taskKind, dueAt: taskDue || null }), "task created")}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Create task</button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs">{msg}</p>}
    </div>
  );
}

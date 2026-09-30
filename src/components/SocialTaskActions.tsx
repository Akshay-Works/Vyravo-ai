"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SocialTaskActions({ mode, taskId, socialUsers }: {
  mode: "create" | "done"; taskId?: number; socialUsers?: any[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [platform, setPlatform] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignee, setAssignee] = useState("");
  const [rec, setRec] = useState<string[]>([]);

  if (mode === "done") {
    return (
      <button disabled={busy} onClick={async () => {
        setBusy(true);
        await fetch("/api/social/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "done", id: taskId }) });
        router.refresh();
      }} className="rounded-lg bg-emerald-600/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-50">
        ✓ Done
      </button>
    );
  }

  const toggleDay = (d: string) => setRec((r) => (r.includes(d) ? r.filter((x) => x !== d) : [...r, d]));
  const input = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-primary">+ Assign task</button>
      {open && (
        <div className="mt-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title *" className={input} />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description / instructions" rows={2} className={input} />
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform (optional)" className={input} />
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={input} />
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
              <option value="">Anyone</option>
              {(socialUsers || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 text-xs text-grey">
            <span className="mr-1">🔁 Repeat:</span>
            {[["1", "M"], ["2", "T"], ["3", "W"], ["4", "T"], ["5", "F"], ["6", "S"], ["0", "S"]].map(([d, l]) => (
              <button key={d} onClick={() => toggleDay(d)}
                className={`h-7 w-7 rounded-full text-xs font-bold ${rec.includes(d) ? "bg-primary text-white" : "bg-surface-2 text-grey"}`}>{l}</button>
            ))}
          </div>
          <button disabled={busy || !title.trim()} onClick={async () => {
            setBusy(true);
            await fetch("/api/social/tasks", { method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ title, description: desc, platform, dueAt: dueAt || null, assigneeId: assignee ? Number(assignee) : null, recurrence: rec.sort().join(",") }) });
            setBusy(false); setOpen(false); setTitle(""); setDesc(""); setRec([]);
            router.refresh();
          }} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">Assign</button>
        </div>
      )}
    </div>
  );
}

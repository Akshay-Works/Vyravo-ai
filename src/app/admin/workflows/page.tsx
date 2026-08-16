"use client";

import { useEffect, useState } from "react";

export default function WorkflowsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    const r = await fetch(`/api/admin/workflows?${params}`);
    const d = await r.json();
    setData(d.workflows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [status]);

  const retry = async (id: number) => {
    await fetch("/api/admin/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  };

  const retryAll = async () => {
    await fetch("/api/admin/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryAll: true }) });
    load();
  };

  const statuses = ["", "completed", "failed", "retrying", "running", "pending"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Workflow <span className="gradient-text">Monitoring</span></h1>
        <button onClick={retryAll} className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">Retry All Failed</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${status === s ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-grey hover:text-white"}`}>
            {s || "All"}
          </button>
        ))}
      </div>
      {loading ? <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" /> : data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center text-grey text-sm">No workflow executions yet.</div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-grey-dark border-b border-border">
              <tr><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Attempts</th><th className="px-4 py-3 font-medium">Error</th><th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((w: any) => (
                <tr key={w.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-grey">{w.eventType}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${w.status === "completed" ? "text-green-400 border-green-500/30" : w.status === "failed" ? "text-red-400 border-red-500/30" : w.status === "retrying" ? "text-orange-400 border-orange-500/30" : "text-yellow-400 border-yellow-500/30"}`}>{w.status}</span></td>
                  <td className="px-4 py-3 text-grey-dark">{w.attemptCount}</td>
                  <td className="px-4 py-3 text-red-400 max-w-xs truncate" title={w.lastError}>{w.lastError || "—"}</td>
                  <td className="px-4 py-3 text-grey-dark">{w.createdAt ? new Date(w.createdAt).toLocaleDateString() : ""}</td>
                  <td className="px-4 py-3">{w.status === "failed" ? <button onClick={() => retry(w.id)} className="text-xs px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors">Retry</button> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

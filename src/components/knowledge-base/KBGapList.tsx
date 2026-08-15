"use client";

import { useEffect, useState } from "react";

interface Gap {
  id: number;
  question: string;
  frequency: number;
  category: string | null;
  source: string | null;
  status: string;
  suggestedAction: string | null;
  createdAt: string;
  updatedAt: string;
}

export function KBGapList() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/knowledge-base/gaps?${params}`);
      const json = await res.json();
      setGaps(json.gaps || []);
      setTotal(json.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const updateStatus = async (id: number, status: string) => {
    await fetch("/api/knowledge-base/gaps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  const addGap = async () => {
    if (!newQuestion.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/knowledge-base/gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestion, category: "manual" }),
      });
      setNewQuestion("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const statusStyles: Record<string, string> = {
    open: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    resolved: "bg-green-500/10 text-green-400 border-green-500/30",
    ignored: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          Knowledge <span className="gradient-text">Gaps</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Questions the AI couldn't answer from the Knowledge Base. Fill these gaps to continuously improve.
        </p>
      </div>

      {/* Add manual gap */}
      <div className="rounded-xl border border-border bg-surface p-4 flex gap-3">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addGap()}
          placeholder="Log a question the AI should be able to answer…"
          className="flex-1 px-4 py-2.5 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
        />
        <button onClick={addGap} disabled={saving || !newQuestion.trim()} className="btn-primary text-sm disabled:opacity-50">
          Log Gap
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["", "open", "in_progress", "resolved", "ignored"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              filter === s
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-grey hover:text-white"
            }`}
          >
            {s === "" ? `All (${total})` : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-20 rounded-xl bg-surface border border-border" />
          ))}
        </div>
      ) : gaps.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-4xl mb-4">🎉</p>
          <h3 className="text-lg font-semibold font-[var(--font-heading)]">No {filter || ""} gaps</h3>
          <p className="mt-2 text-sm text-grey">Great — the AI is finding answers. Gaps appear here when it can't.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gaps.map((g) => (
            <div key={g.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{g.question}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-grey-dark">
                    <span className={`px-2 py-0.5 rounded-full border ${statusStyles[g.status] || statusStyles.open}`}>
                      {g.status.replace("_", " ")}
                    </span>
                    <span className="font-medium text-orange-400">asked {g.frequency}×</span>
                    {g.category && <span>{g.category}</span>}
                    {g.source && <span>source: {g.source}</span>}
                    <span>first seen {new Date(g.createdAt).toLocaleDateString()}</span>
                  </div>
                  {g.suggestedAction && (
                    <p className="mt-2 text-xs text-grey italic">💡 {g.suggestedAction}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {g.status === "open" && (
                    <button
                      onClick={() => updateStatus(g.id, "in_progress")}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-blue-400 hover:border-blue-500/40 transition-colors"
                    >
                      Start
                    </button>
                  )}
                  {g.status !== "resolved" && (
                    <button
                      onClick={() => updateStatus(g.id, "resolved")}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors"
                    >
                      ✓ Resolved
                    </button>
                  )}
                  {g.status !== "ignored" && (
                    <button
                      onClick={() => updateStatus(g.id, "ignored")}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-gray-400 transition-colors"
                    >
                      Ignore
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

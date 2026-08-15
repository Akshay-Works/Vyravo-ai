"use client";

// Full call history with filters. Desktop table, mobile cards.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { voiceFetch, VoiceApiError, formatDateTime, formatDuration } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, Badge, SkeletonCard } from "./UI";
import type { CallRecord } from "@/lib/voice/types";

type Filter = "all" | "qualified" | "followup" | "escalated";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All calls" },
  { id: "qualified", label: "Qualified leads" },
  { id: "followup", label: "Follow-up required" },
  { id: "escalated", label: "Escalations" },
];

export function CallHistoryList() {
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await voiceFetch<{ calls: CallRecord[] }>("/api/voice/calls");
      setCalls(data.calls);
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load call history.");
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (needsKey) return <AdminKeyPrompt onUnlock={load} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!calls) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const filtered = calls.filter((c) => {
    if (filter === "qualified") return c.leadStatus === "qualified";
    if (filter === "followup") return c.followUpRequired;
    if (filter === "escalated")
      return (
        c.actions.some((a) => a.includes("Human escalation")) ||
        c.actions.some((a) => a.includes("Complaint")) ||
        c.outcome === "Callback requested"
      );
    return true;
  });

  if (calls.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-12 text-center">
        <p className="text-4xl">📞</p>
        <p className="mt-4 text-base font-medium text-white">No calls recorded yet</p>
        <p className="mt-1 text-sm text-grey max-w-sm mx-auto">
          Calls will appear here once the receptionist handles them. Run a demo call from the
          Voice Receptionist dashboard to see a full record.
        </p>
        <Link href="/voice-receptionist" className="btn-primary mt-6 text-sm">
          Open Voice Receptionist
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-xs font-medium px-3.5 py-2 rounded-full border transition-colors ${
              filter === f.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-surface text-grey hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-grey-dark self-center">
          {filtered.length} of {calls.length} calls
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-grey">No calls match this filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg border-b border-border text-left">
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Caller</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Date &amp; Time</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Duration</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Intent</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Lead</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Outcome</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-grey-dark uppercase tracking-wider">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((call) => (
                  <tr key={call.callId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        href={`/voice-receptionist/calls/${call.callId}`}
                        className="font-medium text-white hover:text-primary transition-colors"
                      >
                        {call.callerName || "Unknown caller"}
                      </Link>
                      <p className="text-xs text-grey">{call.callerPhone || "—"}</p>
                    </td>
                    <td className="px-5 py-4 text-grey">{formatDateTime(call.startedAt)}</td>
                    <td className="px-5 py-4 text-grey">{formatDuration(call.durationSec)}</td>
                    <td className="px-5 py-4">
                      <Badge tone="primary">{call.intent || "general"}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={call.leadStatus === "qualified" ? "green" : call.leadStatus === "customer" ? "accent" : "grey"}>
                        {call.leadStatus}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-grey">{call.outcome}</td>
                    <td className="px-5 py-4">
                      <Badge tone={call.followUpRequired ? "accent" : "grey"}>
                        {call.followUpRequired ? "required" : "none"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((call) => (
              <Link
                key={call.callId}
                href={`/voice-receptionist/calls/${call.callId}`}
                className="block rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white truncate">{call.callerName || "Unknown caller"}</p>
                  <Badge tone="primary">{call.intent || "general"}</Badge>
                </div>
                <p className="mt-1 text-xs text-grey">
                  {formatDateTime(call.startedAt)} · {formatDuration(call.durationSec)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone={call.leadStatus === "qualified" ? "green" : "grey"}>{call.leadStatus}</Badge>
                  <Badge tone={call.followUpRequired ? "accent" : "grey"}>
                    {call.followUpRequired ? "follow-up required" : "no follow-up"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

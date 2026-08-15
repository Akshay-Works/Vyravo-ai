"use client";

// Recent call activity — a compact timeline of the latest stored calls.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { voiceFetch, VoiceApiError, formatDateTime, formatDuration } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, Badge, SkeletonCard } from "./UI";
import type { CallRecord } from "@/lib/voice/types";

export function RecentActivity() {
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await voiceFetch<{ calls: CallRecord[] }>("/api/voice/calls");
      setCalls(data.calls.slice(0, 5));
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load recent activity.");
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
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <p className="text-3xl">📞</p>
        <p className="mt-3 text-sm font-medium text-white">No calls yet</p>
        <p className="mt-1 text-xs text-grey">
          Run a demo call above and the activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <Link
          key={call.callId}
          href={`/voice-receptionist/calls/${call.callId}`}
          className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 card-hover group"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm shrink-0">
            {(call.callerName || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">
              {call.callerName || "Unknown caller"}
              <span className="text-grey-dark font-normal"> · {call.callerPhone || "no number"}</span>
            </p>
            <p className="text-xs text-grey truncate">
              {formatDateTime(call.startedAt)} · {formatDuration(call.durationSec)}
            </p>
          </div>
          <div className="hidden sm:block">
            <Badge tone="primary">{call.intent || "general"}</Badge>
          </div>
          <Badge
            tone={
              call.outcome.includes("Discovery") || call.leadStatus === "qualified"
                ? "green"
                : call.outcome.includes("Callback") || call.outcome.includes("Escalated") || call.outcome.includes("Complaint")
                ? "red"
                : "grey"
            }
          >
            {call.outcome}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

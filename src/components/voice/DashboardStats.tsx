"use client";

// Dashboard KPIs — every number is computed server-side from stored calls.

import { useCallback, useEffect, useState } from "react";
import { voiceFetch, VoiceApiError, formatDuration } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, SkeletonCard } from "./UI";
import type { VoiceStats } from "@/lib/voice/types";

interface StatusResponse {
  provider: { id: string; mode: string; connected: boolean; supportsTransfer: boolean; label: string };
  persistence: { mode: string };
  security: { adminKeyConfigured: boolean };
  demoMode: boolean;
}

export function DashboardStats() {
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([
        voiceFetch<{ stats: VoiceStats }>("/api/voice/stats"),
        voiceFetch<StatusResponse>("/api/voice/status"),
      ]);
      setStats(s.stats);
      setStatus(st);
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load dashboard stats.");
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (needsKey) return <AdminKeyPrompt onUnlock={load} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Status",
      value: status?.provider.mode === "demo" ? "Demo Mode" : "Live",
      sub: status?.provider.mode === "demo" ? "Simulated line connected" : "Provider connected",
      pulse: true,
    },
    { label: "Calls Today", value: String(stats.todayCalls), sub: "Since 00:00 IST" },
    { label: "Calls Handled", value: String(stats.totalCalls), sub: `${stats.answeredCalls} answered · ${stats.missedCalls} missed` },
    { label: "Qualified Leads", value: String(stats.qualifiedLeads), sub: "Captured from calls" },
    { label: "Appointments Booked", value: String(stats.appointmentsBooked), sub: "Discovery call requests" },
    { label: "Escalations", value: String(stats.escalations), sub: "Human follow-up required" },
    {
      label: "Avg Call Duration",
      value: formatDuration(stats.averageDurationSec),
      sub: "Across all calls",
    },
    {
      label: "Lead Conversion Rate",
      value: `${Math.round(stats.leadConversionRate * 100)}%`,
      sub: "Calls → qualified leads",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-5 card-hover">
            <div className="flex items-center gap-2">
              {c.pulse && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
              <p className="text-xs text-grey-dark uppercase tracking-wider">{c.label}</p>
            </div>
            <p className="mt-3 text-3xl font-semibold gradient-text font-[var(--font-heading)]">{c.value}</p>
            <p className="mt-1 text-xs text-grey">{c.sub}</p>
          </div>
        ))}
      </div>
      {status && (
        <p className="mt-3 text-xs text-grey-dark">
          All figures are computed from stored {status.demoMode ? "demo (simulated)" : ""} call records — no
          fabricated statistics. Persistence: {status.persistence.mode === "database" ? "project database" : "in-memory (demo)"}.
        </p>
      )}
    </div>
  );
}

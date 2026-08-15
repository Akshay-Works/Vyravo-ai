"use client";

// Call detail — full record: info, AI summary, intent, qualification,
// transcript, actions, follow-up, and CRM retry when a sync failed.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { voiceFetch, VoiceApiError, formatDateTime, formatDuration, formatTime } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, Badge, SkeletonCard } from "./UI";
import type { CallRecord } from "@/lib/voice/types";

export function CallDetailView({ callId }: { callId: string }) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await voiceFetch<{ call: CallRecord }>(`/api/voice/calls/${callId}`);
      setCall(data.call);
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load this call.");
      }
    }
  }, [callId]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function retryCrmSync() {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const data = await voiceFetch<{ success: boolean; crm: { status: string; action?: string; error?: string }; call: CallRecord }>(
        `/api/voice/calls/${callId}`,
        { method: "POST", body: JSON.stringify({ action: "retry-crm-sync" }) }
      );
      setCall(data.call);
      setRetryMsg(
        data.success
          ? "CRM sync completed successfully."
          : `CRM sync still failed: ${data.crm.error || "unknown error"}`
      );
    } catch (e) {
      setRetryMsg((e as Error).message || "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  if (needsKey) return <AdminKeyPrompt onUnlock={load} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!call) return <SkeletonCard className="h-96" />;

  return (
    <div className="space-y-6">
      <Link href="/voice-receptionist/calls" className="inline-flex items-center gap-2 text-sm text-primary hover:text-white transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to call history
      </Link>

      {/* Call information */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="p-6 md:p-8 bg-gradient-to-r from-primary/5 to-accent/5 border-b border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-semibold">
                {(call.callerName || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-semibold font-[var(--font-heading)]">
                  {call.callerName || "Unknown caller"}
                </h2>
                <p className="text-sm text-grey mt-0.5">{call.callerPhone || "No number captured"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">Source: {call.source === "demo" ? "Demo (simulated)" : call.source}</Badge>
              <Badge tone={call.leadStatus === "qualified" ? "green" : call.leadStatus === "customer" ? "accent" : "grey"}>
                {call.leadStatus}
              </Badge>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Date</p>
              <p className="mt-1 text-white">{formatDateTime(call.startedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Duration</p>
              <p className="mt-1 text-white">{formatDuration(call.durationSec)}</p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Outcome</p>
              <p className="mt-1 text-white">{call.outcome}</p>
            </div>
            <div>
              <p className="text-xs text-grey-dark uppercase tracking-wider">Follow-up</p>
              <p className="mt-1 text-white capitalize">{call.followUpStatus}</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6">
          {/* AI summary */}
          <div className="rounded-xl bg-bg border border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">AI Summary</h3>
            <p className="text-sm text-grey leading-relaxed">{call.summary || "No summary generated."}</p>
          </div>

          {/* Qualification */}
          <div className="rounded-xl bg-bg border border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Qualification</h3>
            {Object.keys(call.qualification).length === 0 ? (
              <p className="text-sm text-grey">No lead information captured.</p>
            ) : (
              <dl className="space-y-2">
                {Object.entries(call.qualification).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 text-sm">
                    <dt className="text-grey-dark capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
                    <dd className="text-white text-right">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* Actions taken */}
          <div className="rounded-xl bg-bg border border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Actions Taken</h3>
            {call.actions.length === 0 ? (
              <p className="text-sm text-grey">No actions required.</p>
            ) : (
              <ul className="space-y-2">
                {call.actions.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-grey">
                    <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Integrations */}
          <div className="rounded-xl bg-bg border border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Integrations</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-grey">CRM (HubSpot)</span>
                <Badge tone={call.crmSyncStatus === "synced" ? "green" : call.crmSyncStatus === "failed" ? "red" : "grey"}>
                  {call.crmSyncStatus === "synced" ? "synced" : call.crmSyncStatus === "failed" ? "sync failed" : "not required"}
                </Badge>
              </div>
              {call.crmSyncStatus === "failed" && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <p className="text-xs text-red-400 mb-2">CRM sync failed — retry required. The call record is safely stored.</p>
                  <button onClick={retryCrmSync} disabled={retrying} className="btn-secondary text-xs">
                    {retrying ? "Retrying…" : "Retry CRM Sync"}
                  </button>
                  {retryMsg && <p className="mt-2 text-xs text-grey">{retryMsg}</p>}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-grey">Email Automation</span>
                <Badge tone={call.emailStatus === "triggered" ? "green" : call.emailStatus === "failed" ? "red" : "grey"}>
                  {call.emailStatus === "triggered" ? "triggered" : call.emailStatus === "failed" ? "trigger failed" : "not required"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-grey">Recording</span>
                <Badge tone="grey">{call.recordingAvailable ? "available" : "not available (demo)"}</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-white">Conversation Transcript</h3>
          <p className="text-xs text-grey mt-0.5">
            {call.transcriptAvailable
              ? "Full transcript captured during the call."
              : "Transcript not available for this call."}
          </p>
        </div>
        <div className="p-6 space-y-4 max-h-[480px] overflow-y-auto bg-bg">
          {call.transcript.map((m, i) =>
            m.role === "system" ? (
              <p key={i} className="text-center text-[11px] text-grey-dark py-1">
                {m.text} · {formatTime(m.at)}
              </p>
            ) : (
              <div key={i} className={`flex gap-3 ${m.role === "caller" ? "justify-end" : ""}`}>
                {m.role === "receptionist" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold">
                    R
                  </div>
                )}
                <div
                  className={`rounded-2xl border px-4 py-3 max-w-[80%] ${
                    m.role === "caller"
                      ? "bg-primary/10 border-primary/20 rounded-tr-sm"
                      : "bg-surface-2 border-border rounded-tl-sm"
                  }`}
                >
                  <p className={`text-xs mb-1 font-medium ${m.role === "caller" ? "text-accent text-right" : "text-primary"}`}>
                    {m.role === "caller" ? "Caller" : "AI Receptionist"} · {formatTime(m.at)}
                  </p>
                  <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{m.text}</p>
                </div>
                {m.role === "caller" && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-surface-2 border border-border text-grey text-xs font-semibold">
                    C
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

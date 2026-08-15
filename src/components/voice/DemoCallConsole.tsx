"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { voiceFetch, formatDuration } from "./voiceApi";
import { Badge, StatusDot, ErrorBanner } from "./UI";
import type { CallRecord, TranscriptMessage } from "@/lib/voice/types";

interface DemoStartResponse {
  callId: string;
  from: string;
  to: string;
  receptionistName: string;
  businessName: string;
  transcript: TranscriptMessage[];
  note: string;
}

interface TurnResponse {
  reply: string;
  intent: string | null;
  leadStatus: string;
  callEnded: boolean;
  actions: string[];
  qualification: Record<string, string>;
  transcript: TranscriptMessage[];
}

interface EndResponse {
  call: CallRecord;
  integrations: {
    crm: { status: string; detail: string | null };
    email: { status: string; type: string | null };
  };
}

const QUICK_PHRASES = [
  "Hi, what services do you offer?",
  "How much does it cost?",
  "I'd like to book a discovery call",
  "What are your business hours?",
  "Where are you located?",
  "I want to speak to a human",
  "Can someone call me back?",
  "I have a complaint about the service",
];

export function DemoCallConsole() {
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ending" | "ended">("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [receptionistName, setReceptionistName] = useState("Vera");
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<CallRecord | null>(null);
  const [integrationInfo, setIntegrationInfo] = useState<EndResponse["integrations"] | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, phase]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    setSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  async function startDemoCall() {
    setError(null);
    setRecord(null);
    setIntegrationInfo(null);
    setMessages([]);
    setPhase("connecting");
    try {
      const data = await voiceFetch<DemoStartResponse>("/api/voice/demo-call", { method: "POST" });
      setCallId(data.callId);
      setFrom(data.from);
      setReceptionistName(data.receptionistName);
      setMessages(data.transcript);
      startTimer();
      setPhase("live");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      setError((e as Error).message || "Could not start the demo call.");
      setPhase("idle");
    }
  }

  async function sendMessage(text: string) {
    if (!callId || busy || phase !== "live") return;
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "caller", text: message, at: new Date().toISOString() }]);
    try {
      const data = await voiceFetch<TurnResponse>("/api/voice/conversation", {
        method: "POST",
        body: JSON.stringify({ callId, message }),
      });
      // small delay so the receptionist feels like it's "listening"
      await new Promise((r) => setTimeout(r, 700));
      setMessages(data.transcript);
      if (data.callEnded) {
        await new Promise((r) => setTimeout(r, 900));
        await endCall();
      }
    } catch (e) {
      setError((e as Error).message || "The call could not continue.");
    } finally {
      setBusy(false);
    }
  }

  async function endCall() {
    if (!callId || phase === "ending" || phase === "ended") return;
    setPhase("ending");
    setBusy(true);
    setError(null);
    try {
      const data = await voiceFetch<EndResponse>("/api/voice/end-call", {
        method: "POST",
        body: JSON.stringify({ callId }),
      });
      setRecord(data.call);
      setIntegrationInfo(data.integrations);
      stopTimer();
      setPhase("ended");
    } catch (e) {
      setError((e as Error).message || "Could not end the call cleanly.");
      setPhase("live");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhase("idle");
    setCallId(null);
    setMessages([]);
    setRecord(null);
    setIntegrationInfo(null);
    setSeconds(0);
    setError(null);
  }

  // ------------------------------------------------------------------ idle
  if (phase === "idle" || phase === "connecting") {
    return (
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="p-6 md:p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 border border-border flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              />
            </svg>
          </div>
          <h3 className="mt-5 text-xl md:text-2xl font-semibold font-[var(--font-heading)]">
            Try a Live Demo Call
          </h3>
          <p className="mt-3 text-sm text-grey max-w-xl mx-auto leading-relaxed">
            This simulates an incoming business call handled by the AI receptionist. No real phone line is
            connected — but intent detection, lead capture, CRM sync, discovery-call booking, and email
            triggers all run exactly as they would in production.
          </p>
          <button onClick={startDemoCall} disabled={phase === "connecting"} className="btn-primary mt-6 px-8 py-3.5 text-base">
            {phase === "connecting" ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Connecting…
              </>
            ) : (
              "Run Demo Call"
            )}
          </button>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {QUICK_PHRASES.slice(0, 4).map((p) => (
              <span key={p} className="text-xs px-3 py-1.5 rounded-full border border-border bg-bg text-grey">
                “{p}”
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- ended
  if (phase === "ended" && record) {
    return (
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusDot active={false} color="bg-grey-dark" />
            <div>
              <p className="text-sm font-medium text-white">Call ended — summary generated</p>
              <p className="text-xs text-grey">
                {record.outcome} · {formatDuration(record.durationSec)} · Demo Mode (simulated)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/voice-receptionist/calls/${record.callId}`} className="btn-secondary text-xs">
              View Call Record
            </Link>
            <button onClick={reset} className="btn-primary text-xs">
              Run Another Demo Call
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 p-6 md:p-8">
          {/* AI summary + qualification */}
          <div className="space-y-4">
            <div className="rounded-xl bg-bg border border-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">AI Call Summary</h4>
                <Badge tone="primary">Intent: {record.intent || "general"}</Badge>
              </div>
              <p className="text-sm text-grey leading-relaxed">{record.summary}</p>
            </div>
            <div className="rounded-xl bg-bg border border-border p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Qualification</h4>
              {Object.keys(record.qualification).length === 0 ? (
                <p className="text-sm text-grey">No lead information captured in this call.</p>
              ) : (
                <dl className="space-y-2">
                  {Object.entries(record.qualification).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 text-sm">
                      <dt className="text-grey-dark capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd className="text-white text-right">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          {/* Actions + integration results */}
          <div className="space-y-4">
            <div className="rounded-xl bg-bg border border-border p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Actions Taken</h4>
              {record.actions.length === 0 ? (
                <p className="text-sm text-grey">No actions were required for this call.</p>
              ) : (
                <ul className="space-y-2">
                  {record.actions.map((a) => (
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
            <div className="rounded-xl bg-bg border border-border p-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">Integrations</h4>
              <div className="flex flex-wrap gap-2">
                <Badge tone={record.crmSyncStatus === "synced" ? "green" : record.crmSyncStatus === "failed" ? "red" : "grey"}>
                  CRM: {record.crmSyncStatus === "synced" ? "synced (HubSpot)" : record.crmSyncStatus === "failed" ? "sync failed" : "not required"}
                </Badge>
                <Badge tone={record.emailStatus === "triggered" ? "green" : record.emailStatus === "failed" ? "red" : "grey"}>
                  Email: {record.emailStatus === "triggered" ? "triggered" : record.emailStatus === "failed" ? "trigger failed" : "not required"}
                </Badge>
                <Badge tone={record.followUpRequired ? "accent" : "grey"}>
                  Follow-up: {record.followUpRequired ? "required" : "none"}
                </Badge>
                <Badge tone="accent">Source: {record.source === "demo" ? "Demo (simulated)" : record.source}</Badge>
              </div>
              {record.crmSyncStatus === "failed" && (
                <p className="mt-3 text-xs text-red-400">
                  CRM sync failed — the call is saved and can be retried from the call record page.
                </p>
              )}
              {integrationInfo?.email.type && record.emailStatus === "not_required" && (
                <p className="mt-3 text-xs text-grey-dark">
                  Email trigger ({integrationInfo.email.type}) queued — Email Automation webhook is not connected.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- live
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* Call header */}
      <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white flex items-center gap-2">
              Incoming call {from && <span className="text-grey font-normal">from {from}</span>}
            </p>
            <p className="text-xs text-grey flex items-center gap-1.5">
              <StatusDot color="bg-emerald-500" /> Live · answered by AI receptionist ({receptionistName})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="accent">Demo Mode — Simulated</Badge>
          <span className="text-sm font-semibold text-white tabular-nums">{formatDuration(seconds)}</span>
          <button
            onClick={endCall}
            disabled={busy || phase === "ending"}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            {phase === "ending" ? "Ending…" : "End Call"}
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="h-[400px] md:h-[440px] overflow-y-auto p-5 space-y-4 bg-bg">
        {messages.map((m, i) =>
          m.role === "system" ? (
            <p key={i} className="text-center text-[11px] text-grey-dark py-1">
              {m.text}
            </p>
          ) : m.role === "receptionist" ? (
            <div key={i} className="flex gap-3 animate-fade-in-up">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold">
                {receptionistName.charAt(0)}
              </div>
              <div className="bg-surface-2 rounded-2xl rounded-tl-sm border border-border px-4 py-3 max-w-[80%]">
                <p className="text-xs text-primary mb-1 font-medium">AI Receptionist</p>
                <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3 justify-end animate-fade-in-up">
              <div className="bg-primary/10 rounded-2xl rounded-tr-sm border border-primary/20 px-4 py-3 max-w-[80%]">
                <p className="text-xs text-accent mb-1 font-medium text-right">Caller</p>
                <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{m.text}</p>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-surface-2 border border-border text-grey text-xs font-semibold">
                C
              </div>
            </div>
          )
        )}
        {busy && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary to-accent text-white text-xs font-semibold">
              {receptionistName.charAt(0)}
            </div>
            <TypingIndicator />
          </div>
        )}
      </div>

      {/* Quick phrases */}
      <div className="px-5 pt-3 flex gap-2 overflow-x-auto pb-1">
        {QUICK_PHRASES.map((p) => (
          <button
            key={p}
            disabled={busy}
            onClick={() => sendMessage(p)}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-surface text-grey hover:border-primary/30 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
          >
            “{p}”
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type as the caller…"
          disabled={busy || phase === "ending"}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage(e.currentTarget.value);
              e.currentTarget.value = "";
            }
          }}
          className="flex-1 rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors disabled:opacity-50"
        />
        <button
          onClick={() => {
            if (inputRef.current) {
              sendMessage(inputRef.current.value);
              inputRef.current.value = "";
            }
          }}
          disabled={busy || phase === "ending"}
          className="btn-primary text-sm disabled:opacity-50"
        >
          Speak
        </button>
      </div>

      {error && (
        <div className="px-4 pb-4">
          <ErrorBanner message={error} onRetry={() => setError(null)} />
        </div>
      )}
    </div>
  );
}

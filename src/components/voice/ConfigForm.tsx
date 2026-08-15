"use client";

// Receptionist configuration — business information, receptionist identity,
// greeting (with live preview), and escalation settings.
// Saving requires the admin key when ADMIN_API_KEY is configured server-side.

import { useCallback, useEffect, useState } from "react";
import { voiceFetch, VoiceApiError } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, Badge, SkeletonCard } from "./UI";
import type { VoiceConfig } from "@/lib/voice/types";

const VOICE_OPTIONS = ["Natural Female", "Natural Male", "Warm Female", "Professional Male"];
const STYLE_OPTIONS = ["Professional & friendly", "Formal & concise", "Casual & warm"];
const TIMEZONES = ["Asia/Kolkata (IST)", "Asia/Dubai (GST)", "Europe/London (GMT)", "America/New_York (EST)", "Asia/Singapore (SGT)", "Australia/Sydney (AEST)"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white mb-2">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-grey-dark">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors";

export function ConfigForm() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await voiceFetch<{ config: VoiceConfig }>("/api/voice/config");
      setConfig(data.config);
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load configuration.");
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  function update(patch: Partial<VoiceConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
    setSaved(false);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await voiceFetch<{ config: VoiceConfig }>("/api/voice/config", {
        method: "POST",
        body: JSON.stringify({ config }),
      });
      setConfig(data.config);
      setSaved(true);
      setNeedsKey(false);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) setNeedsKey(true);
      else setError((e as Error).message || "Could not save configuration.");
    } finally {
      setSaving(false);
    }
  }

  if (needsKey) return <AdminKeyPrompt onUnlock={load} />;
  if (error && !config) return <ErrorBanner message={error} onRetry={load} />;
  if (!config) return <SkeletonCard className="h-96" />;

  const greetingPreview = (config.greeting || "")
    .replaceAll("{business}", config.businessName)
    .replaceAll("{name}", config.receptionistName);

  return (
    <div className="space-y-6">
      {/* Business information */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-base">🏢</span>
          <div>
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Business Information</h2>
            <p className="text-xs text-grey">What the receptionist knows about your business — it never invents anything beyond this.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Business name">
            <input className={inputCls} value={config.businessName} onChange={(e) => update({ businessName: e.target.value })} />
          </Field>
          <Field label="Industry">
            <input className={inputCls} value={config.industry} onChange={(e) => update({ industry: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Business description" hint="Used when callers ask what the business does.">
              <textarea
                rows={3}
                className={inputCls}
                value={config.businessDescription}
                onChange={(e) => update({ businessDescription: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Location">
            <input className={inputCls} value={config.location} onChange={(e) => update({ location: e.target.value })} />
          </Field>
          <Field label="Business hours">
            <input className={inputCls} value={config.businessHours} onChange={(e) => update({ businessHours: e.target.value })} />
          </Field>
          <Field label="Time zone">
            <select className={inputCls} value={config.timeZone} onChange={(e) => update({ timeZone: e.target.value })}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Receptionist identity */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-base">🎙️</span>
          <div>
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Receptionist Identity</h2>
            <p className="text-xs text-grey">How your AI receptionist introduces itself and speaks.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Receptionist name">
            <input className={inputCls} value={config.receptionistName} onChange={(e) => update({ receptionistName: e.target.value })} />
          </Field>
          <Field label="Voice">
            <select className={inputCls} value={config.voice} onChange={(e) => update({ voice: e.target.value })}>
              {VOICE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <input className={inputCls} value={config.language} onChange={(e) => update({ language: e.target.value })} />
          </Field>
          <Field label="Speaking style">
            <select className={inputCls} value={config.speakingStyle} onChange={(e) => update({ speakingStyle: e.target.value })}>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Greeting"
              hint={'Use {business} for the business name and {name} for the receptionist name. Example: "Hi, thanks for calling {business}. I am {name}, the AI receptionist. How can I help you today?"'}
            >
              <textarea rows={2} className={inputCls} value={config.greeting} onChange={(e) => update({ greeting: e.target.value })} />
            </Field>
            <div className="mt-3 rounded-xl bg-bg border border-border p-4">
              <p className="text-xs text-grey-dark uppercase tracking-wider mb-1.5">Live preview</p>
              <p className="text-sm text-white leading-relaxed">“{greetingPreview}”</p>
            </div>
          </div>
        </div>
      </div>

      {/* Escalation */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-base">🤝</span>
          <div>
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Human Escalation</h2>
            <p className="text-xs text-grey">
              When a caller asks for a human, the receptionist collects a callback request. A live transfer becomes
              available once a real voice provider is connected.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Escalation enabled">
            <div className="flex items-center gap-3">
              <button
                onClick={() => update({ escalationEnabled: !config.escalationEnabled })}
                className={`w-12 h-7 rounded-full transition-colors relative ${config.escalationEnabled ? "bg-primary" : "bg-surface-2 border border-border"}`}
                aria-label="Toggle escalation"
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${config.escalationEnabled ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
              <span className="text-sm text-grey">{config.escalationEnabled ? "Enabled" : "Disabled"}</span>
            </div>
          </Field>
          <Field label="Callback / transfer number">
            <input className={inputCls} value={config.transferNumber || ""} onChange={(e) => update({ transferNumber: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Mode + save */}
      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">Demo Mode</Badge>
            <span className="text-sm text-grey">Simulated line — no live phone number connected yet.</span>
          </div>
          <p className="mt-2 text-xs text-grey-dark max-w-lg">
            The receptionist is fully functional for demos. Connecting a real number is a provider step
            (see INTEGRATIONS.md) and does not change this configuration.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-sm whitespace-nowrap">
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>

      {saved && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
          Configuration saved — the receptionist now uses the updated settings on the next call.
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={save} />}
    </div>
  );
}

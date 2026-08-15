"use client";

// Honest integration status panel: what is actually connected vs simulated.

import { useCallback, useEffect, useState } from "react";
import { voiceFetch, VoiceApiError } from "./voiceApi";
import { AdminKeyPrompt, ErrorBanner, Badge, SkeletonCard } from "./UI";

interface StatusResponse {
  provider: { id: string; mode: string; connected: boolean; supportsTransfer: boolean; label: string };
  integrations: {
    crm: { name: string; connected: boolean; note: string };
    emailAutomation: { name: string; connected: boolean; note: string };
    discoveryCall: { name: string; connected: boolean; note: string };
  };
  persistence: { mode: string; note: string };
  security: { adminKeyConfigured: boolean; note: string };
  demoMode: boolean;
}

export function IntegrationStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await voiceFetch<StatusResponse>("/api/voice/status");
      setStatus(data);
      setNeedsKey(false);
      setError(null);
    } catch (e) {
      if (e instanceof VoiceApiError && e.needsAdminKey) {
        setNeedsKey(true);
        setError(null);
      } else {
        setError((e as Error).message || "Could not load integration status.");
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (needsKey) return <AdminKeyPrompt onUnlock={load} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!status) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const items = [
    {
      title: "Voice Provider",
      connected: status.provider.connected,
      simulated: status.provider.mode === "demo",
      note: status.provider.label,
      icon: "📞",
    },
    {
      title: status.integrations.crm.name,
      connected: status.integrations.crm.connected,
      simulated: false,
      note: status.integrations.crm.note,
      icon: "🗂️",
    },
    {
      title: status.integrations.emailAutomation.name,
      connected: status.integrations.emailAutomation.connected,
      simulated: false,
      note: status.integrations.emailAutomation.note,
      icon: "✉️",
    },
    {
      title: status.integrations.discoveryCall.name,
      connected: status.integrations.discoveryCall.connected,
      simulated: false,
      note: status.integrations.discoveryCall.note,
      icon: "📅",
    },
  ];

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-xl">{item.icon}</span>
              {item.simulated ? (
                <Badge tone="accent">Simulated</Badge>
              ) : item.connected ? (
                <Badge tone="green">Connected</Badge>
              ) : (
                <Badge tone="grey">Not Connected</Badge>
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
            <p className="mt-1.5 text-xs text-grey leading-relaxed">{item.note}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-grey-dark">
        {status.security.note} · {status.persistence.note}
      </p>
    </div>
  );
}

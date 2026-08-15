"use client";

// Small shared UI primitives for the Voice Receptionist screens.
// Uses the existing Vyravo AI design tokens (bg/surface/border/primary/accent).

import { useState } from "react";
import { getAdminKey, setAdminKey } from "./voiceApi";

/** Badge with accent styles, e.g. "Demo", "Simulated", "Connected". */
export function Badge({
  tone = "accent",
  children,
}: {
  tone?: "accent" | "primary" | "grey" | "green" | "red";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    accent: "bg-accent/10 text-accent border-accent/20",
    primary: "bg-primary/10 text-primary border-primary/20",
    grey: "bg-white/5 text-grey-dark border-border",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2.5 py-1 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Status dot (pulse when active). */
export function StatusDot({ active = true, color = "bg-primary" }: { active?: boolean; color?: string }) {
  return <span className={`w-2 h-2 rounded-full ${color} ${active ? "animate-pulse" : ""}`} />;
}

/** Shown when an endpoint requires the admin key. */
export function AdminKeyPrompt({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  const [value, setValue] = useState(getAdminKey());

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
      <p className="text-sm font-medium text-white">This area is protected</p>
      <p className="mt-1 text-xs text-grey max-w-md mx-auto">
        The voice endpoints require an admin key (ADMIN_API_KEY). Enter it to view call data.
      </p>
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2 max-w-sm mx-auto">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Admin key"
          className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-white placeholder-grey-dark focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />
        <button
          onClick={() => {
            setAdminKey(value);
            onUnlock();
          }}
          className="btn-primary text-sm whitespace-nowrap"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

/** Generic error banner with retry. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 flex items-center justify-between gap-4">
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-xs whitespace-nowrap">
          Retry
        </button>
      )}
    </div>
  );
}

/** Loading skeleton card. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl border border-border bg-surface animate-pulse ${className}`} />;
}

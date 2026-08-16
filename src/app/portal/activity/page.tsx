"use client";

import { useEffect, useState } from "react";

export default function PortalActivityPage() {
  const [activity, setAct] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/activity").then((r) => r.json()).then((d) => setAct(d.activity || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Activity</span></h1>
      {activity.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">📈</p><p className="text-grey">No activity yet.</p></div>
      ) : (
        <div className="space-y-3">
          {activity.map((a: any) => (
            <div key={a.id} className="rounded-xl border border-border bg-surface p-4 flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm shrink-0">
                {a.type === "proposal" ? "📄" : a.type === "file" ? "📁" : a.type === "message" ? "💬" : a.type === "ticket" ? "🎫" : a.type === "client" || a.type === "account" ? "👤" : "📋"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{a.action}</p>
                {a.description && <p className="text-xs text-grey mt-0.5">{a.description}</p>}
                <p className="text-xs text-grey-dark mt-1">{new Date(a.createdAt).toLocaleDateString()} · {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/proposals/format";

interface Analytics {
  total: number;
  byStatus: Record<string, number>;
  totalValue: number;
  conversionRate: number;
  averageValue: number;
  avgDaysToAccept: number;
  viewRate: number;
  acceptedRevenue: number;
  drafts: number;
  sent: number;
  viewed: number;
  accepted: number;
  rejected: number;
  expired: number;
}

export function ProposalsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [runState, setRunState] = useState("");

  useEffect(() => {
    fetch("/api/proposals/analytics").then((r) => r.json()).then((j) => setData(j.error ? null : j)).catch(() => {});
  }, []);

  const runFollowUps = async () => {
    setRunState("Running…");
    try {
      const res = await fetch("/api/proposals/followups/run", { method: "POST" });
      const j = await res.json();
      setRunState(j.error ? `Error: ${j.error}` : `Done — ${j.followUpsSent} follow-ups, ${j.expired} expired.`);
    } catch {
      setRunState("Failed to run.");
    }
  };

  if (!data) return null;

  const cards = [
    { label: "Total Proposals", value: String(data.total), icon: "📄" },
    { label: "Draft", value: String(data.drafts), icon: "✏️" },
    { label: "In Review", value: String(data.byStatus["in_review"] || 0), icon: "🔍" },
    { label: "Sent", value: String(data.sent), icon: "📨" },
    { label: "Viewed", value: String(data.viewed), icon: "👁️" },
    { label: "Accepted", value: String(data.accepted), icon: "✅" },
    { label: "Rejected", value: String(data.rejected), icon: "❌" },
    { label: "Expired", value: String(data.expired), icon: "⏰" },
    { label: "Total Value", value: formatMoney(data.totalValue), icon: "💰" },
    { label: "Conversion Rate", value: `${data.conversionRate}%`, icon: "🎯" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
            <span className="text-xl">{c.icon}</span>
            <p className="mt-2 text-2xl font-semibold font-[var(--font-heading)] truncate">{c.value}</p>
            <p className="mt-1 text-xs text-grey">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-grey-dark">Average Value</p>
          <p className="mt-1 text-xl font-semibold">{formatMoney(data.averageValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-grey-dark">Average Days to Acceptance</p>
          <p className="mt-1 text-xl font-semibold">{data.avgDaysToAccept}d</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-grey-dark">View Rate (sent → viewed)</p>
          <p className="mt-1 text-xl font-semibold">{data.viewRate}%</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs text-grey-dark">Accepted Revenue</p>
          <p className="mt-1 text-xl font-semibold text-green-400">{formatMoney(data.acceptedRevenue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 flex flex-col justify-between">
          <p className="text-xs text-grey-dark">Follow-up Automation</p>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={runFollowUps} className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
              Run now
            </button>
            <span className="text-xs text-grey-dark">{runState}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-grey-dark">New Proposal</p>
            <p className="mt-1 text-xs text-grey">Manual or AI-generated</p>
          </div>
          <Link href="/admin/proposals/new" className="btn-primary text-sm">＋ Create</Link>
        </div>
      </div>
    </div>
  );
}

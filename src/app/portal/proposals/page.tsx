"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/proposals/format";

export default function PortalProposalsPage() {
  const [proposals, setProps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/proposals").then((r) => r.json()).then((d) => setProps(d.proposals || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Your <span className="gradient-text">Proposals</span></h1>
      {proposals.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">📄</p><p className="text-grey">No proposals yet. Vyravo AI will share proposals with you here.</p></div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p: any) => (
            <Link key={p.id} href={`/proposal/${p.secureToken}`} className="block rounded-xl border border-border bg-surface p-5 card-hover">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold font-[var(--font-heading)]">{p.title}</h3>
                  <p className="text-xs text-grey-dark mt-1">{p.number} · {formatDate(p.createdAt)}</p>
                  {p.summary && <p className="text-sm text-grey mt-2 line-clamp-2">{p.summary}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize ${p.status === "accepted" ? "text-green-400 border-green-500/30 bg-green-500/10" : p.status === "sent" || p.status === "viewed" ? "text-blue-400 border-blue-500/30" : "text-grey border-border"}`}>{p.status}</span>
                  <p className="mt-2 text-sm font-medium">{formatMoney(p.total, p.currency)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

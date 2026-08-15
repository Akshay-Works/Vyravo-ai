"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KBStatusBadge, KBCategoryBadge } from "./Badges";

interface DashboardData {
  stats: {
    totalItems: number;
    published: number;
    drafts: number;
    categories: number;
    recentlyAdded: number;
    recentlyUpdated: number;
    processing: number;
    failed: number;
    knowledgeGaps: number;
  };
  analytics: {
    totalQueries: number;
    askQueries: number;
    searchQueries: number;
    unanswered: number;
    mostSearched: { query: string; count: number }[];
    recentQueries: any[];
    topDocs: { title: string; id: number; count: number }[];
    topGaps: any[];
    queriesByDay: { date: string; count: number }[];
    categoryUsage: { name: string; count: number }[];
  };
}

export function KBDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/knowledge-base/analytics")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(String(e?.message || "Failed to load dashboard")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-surface border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  const { stats, analytics } = data!;

  const statCards = [
    { label: "Total Knowledge Items", value: stats.totalItems, icon: "📚", href: "/admin/knowledge-base/documents" },
    { label: "Published", value: stats.published, icon: "✅", href: "/admin/knowledge-base/documents?status=published" },
    { label: "Drafts", value: stats.drafts, icon: "📝", href: "/admin/knowledge-base/documents?status=draft" },
    { label: "Categories", value: stats.categories, icon: "🗂️", href: "/admin/knowledge-base/articles" },
    { label: "Added (7d)", value: stats.recentlyAdded, icon: "🆕" },
    { label: "Updated (7d)", value: stats.recentlyUpdated, icon: "🔄" },
    { label: "Processing", value: stats.processing, icon: "⚙️", href: "/admin/knowledge-base/documents" },
    { label: "Failed", value: stats.failed, icon: "⚠️", href: "/admin/knowledge-base/documents" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
            Knowledge Base <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-grey">
            Central source of truth for Vyravo AI — powers the chatbot, voice receptionist, and AI systems.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/knowledge-base/documents/upload" className="btn-primary text-sm">
            📤 Upload Document
          </Link>
          <Link href="/admin/knowledge-base/articles/new" className="btn-secondary text-sm">
            ✍️ New Article
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const inner = (
            <>
              <span className="text-2xl">{card.icon}</span>
              <p className="mt-3 text-3xl font-semibold font-[var(--font-heading)]">{card.value}</p>
              <p className="mt-1 text-xs text-grey">{card.label}</p>
            </>
          );
          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-xl border border-border bg-surface p-5 card-hover"
            >
              {inner}
            </Link>
          ) : (
            <div key={card.label} className="rounded-xl border border-border bg-surface p-5">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Knowledge gaps alert */}
      {stats.knowledgeGaps > 0 && (
        <Link
          href="/admin/knowledge-base/gaps"
          className="flex items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 hover:border-orange-500/50 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-orange-400">
              🕳️ {stats.knowledgeGaps} open knowledge {stats.knowledgeGaps === 1 ? "gap" : "gaps"}
            </p>
            <p className="mt-1 text-xs text-grey">
              Questions the AI couldn't answer from the Knowledge Base. Review and add content.
            </p>
          </div>
          <span className="text-sm text-orange-400 font-medium">View →</span>
        </Link>
      )}

      {/* Two-column: most searched + usage */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Most searched */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Most Searched Topics</h2>
          {analytics.mostSearched.length === 0 ? (
            <p className="text-sm text-grey-dark">No searches yet. Try the search or ask the AI assistant a question.</p>
          ) : (
            <ul className="space-y-3">
              {analytics.mostSearched.slice(0, 8).map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-grey truncate">{item.query}</span>
                  <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {item.count}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Category usage */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Knowledge by Category</h2>
          {analytics.categoryUsage.length === 0 ? (
            <p className="text-sm text-grey-dark">No documents yet.</p>
          ) : (
            <ul className="space-y-3">
              {analytics.categoryUsage.slice(0, 10).map((cat) => (
                <li key={cat.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-grey">{cat.name}</span>
                    <span className="text-xs text-grey-dark">{cat.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                      style={{
                        width: `${Math.min(100, (cat.count / Math.max(1, analytics.categoryUsage[0].count)) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Queries + recent */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Usage</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-2xl font-semibold">{analytics.totalQueries}</p>
              <p className="text-xs text-grey mt-1">Total Queries</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-2xl font-semibold">{analytics.askQueries}</p>
              <p className="text-xs text-grey mt-1">AI Questions</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-2xl font-semibold">{analytics.searchQueries}</p>
              <p className="text-xs text-grey mt-1">Searches</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4 text-center">
              <p className="text-2xl font-semibold text-orange-400">{analytics.unanswered}</p>
              <p className="text-xs text-grey mt-1">Unanswered</p>
            </div>
          </div>
        </div>

        {/* Top docs */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Most Retrieved Documents</h2>
          {analytics.topDocs.length === 0 ? (
            <p className="text-sm text-grey-dark">No retrieval data yet.</p>
          ) : (
            <ul className="space-y-3">
              {analytics.topDocs.slice(0, 8).map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/admin/knowledge-base/documents/${doc.id}`}
                    className="flex items-center justify-between gap-4 hover:text-primary transition-colors"
                  >
                    <span className="text-sm text-grey truncate">{doc.title}</span>
                    <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {doc.count}×
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent queries table */}
      {analytics.recentQueries.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Recent Activity</h2>
            <span className="text-xs text-grey-dark">{analytics.totalQueries} total queries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-grey-dark border-b border-border">
                  <th className="px-6 py-3 font-medium">Query</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Results</th>
                  <th className="px-6 py-3 font-medium">Answered</th>
                  <th className="px-6 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics.recentQueries.slice(0, 12).map((q, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-grey max-w-xs truncate">{q.query}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${q.queryType === "ask" ? "border-purple-500/30 text-purple-400 bg-purple-500/10" : "border-blue-500/30 text-blue-400 bg-blue-500/10"}`}>
                        {q.queryType}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-grey">{q.resultsCount}</td>
                    <td className="px-6 py-3">
                      {q.answered ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-orange-400">✗</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-grey-dark whitespace-nowrap">
                      {new Date(q.createdAt).toLocaleDateString()}{" "}
                      {new Date(q.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

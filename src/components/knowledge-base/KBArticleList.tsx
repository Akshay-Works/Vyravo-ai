"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KBStatusBadge, KBAccessBadge, KBCategoryBadge } from "./Badges";

export function KBArticleList() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string | null }[]>([]);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ type: "article", limit: "200" });
    if (filter) params.set("status", filter);
    if (search) params.set("search", search);

    fetch(`/api/knowledge-base/documents?${params}`)
      .then((r) => r.json())
      .then((json) => setDocs(json.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/knowledge-base/categories")
      .then((r) => r.json())
      .then((json) => json.categories && setCategories(json.categories))
      .catch(() => {});
  }, [filter, search]);

  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
            Knowledge <span className="gradient-text">Articles</span>
          </h1>
          <p className="mt-2 text-sm text-grey">
            Curated articles, FAQs, SOPs and internal documentation created by the team.
          </p>
        </div>
        <Link href="/admin/knowledge-base/articles/new" className="btn-primary text-sm">
          ✍️ New Article
        </Link>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles…"
          className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse h-24 rounded-xl bg-surface border border-border" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-4xl mb-4">📝</p>
          <h3 className="text-lg font-semibold font-[var(--font-heading)]">No articles yet</h3>
          <p className="mt-2 text-sm text-grey">Create your first knowledge article to start building the KB.</p>
          <Link href="/admin/knowledge-base/articles/new" className="btn-primary text-sm mt-6 inline-flex">
            ✍️ Create Article
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {docs.map((doc) => {
            const cat = doc.categoryId ? catMap.get(doc.categoryId) : null;
            return (
              <Link
                key={doc.id}
                href={`/admin/knowledge-base/documents/${doc.id}`}
                className="rounded-xl border border-border bg-surface p-5 card-hover"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium text-white group-hover:text-primary transition-colors truncate">
                      {doc.title}
                      {doc.aiGenerated && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">AI</span>
                      )}
                    </h3>
                    <p className="mt-2 text-sm text-grey line-clamp-2">
                      {doc.content ? doc.content.slice(0, 180) : "No content yet — open to edit."}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-grey-dark">
                      <KBCategoryBadge name={cat?.name} icon={cat?.icon} />
                      <span>Updated {new Date(doc.updatedAt).toLocaleDateString()}</span>
                      <span>v{doc.version}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <KBStatusBadge status={doc.status} />
                    <KBAccessBadge level={doc.accessLevel} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

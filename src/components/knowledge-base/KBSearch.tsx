"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { KBAccessBadge } from "./Badges";

interface Result {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  content: string;
  heading: string | null;
  section: string | null;
  pageNumber: number | null;
  category: string | null;
  accessLevel: string;
  score: number;
}

const SUGGESTED_QUESTIONS = [
  "What services does Vyravo AI provide?",
  "What do we offer real estate companies?",
  "What is our discovery call process?",
  "What integrations do we support?",
  "What should I ask a prospect during discovery?",
  "What is our onboarding process?",
  "What does our AI Voice Receptionist do?",
];

export function KBSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [access, setAccess] = useState("");
  const [threshold, setThreshold] = useState(0.1);
  const [topK, setTopK] = useState(8);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch("/api/knowledge-base/categories")
      .then((r) => r.json())
      .then((json) => json.categories && setCategories(json.categories))
      .catch(() => {});
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q, topK: String(topK), threshold: String(threshold) });
      if (categoryId) params.set("categoryId", categoryId);
      if (access) params.set("access", access);
      const res = await fetch(`/api/knowledge-base/search?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setResults(json.results || []);
      setSearched(true);
    } catch (e: any) {
      setError(String(e?.message || "Search failed"));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, access, threshold, topK]);

  // Debounce input
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          Knowledge <span className="gradient-text">Search</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Semantic + keyword hybrid search across the entire Knowledge Base, with category and access filtering.
        </p>
      </div>

      {/* Search bar */}
      <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask anything — e.g. "What do we offer real estate companies?"'
            className="flex-1 px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={() => runSearch(query)}
            disabled={loading}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={access}
            onChange={(e) => setAccess(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Access Levels</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="client-specific">Client-Specific</option>
            <option value="restricted">Restricted</option>
          </select>
          <select
            value={String(topK)}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="5">5 results</option>
            <option value="8">8 results</option>
            <option value="12">12 results</option>
            <option value="20">20 results</option>
          </select>
          <div className="flex items-center gap-2 text-xs text-grey">
            <span className="shrink-0">Min similarity:</span>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-8 text-right">{threshold.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Suggested questions */}
      {!searched && !loading && (
        <div>
          <p className="text-xs uppercase tracking-wider text-grey-dark mb-3">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="px-3 py-2 rounded-lg border border-border bg-surface text-sm text-grey hover:text-white hover:border-primary/40 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse h-28 rounded-xl bg-surface border border-border" />
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && searched && (
        <>
          <p className="text-sm text-grey-dark">
            {results.length === 0
              ? "No results found. Consider logging this as a knowledge gap."
              : `${results.length} relevant chunk${results.length > 1 ? "s" : ""} found`}
          </p>
          <div className="space-y-4">
            {results.map((r) => (
              <div key={r.chunkId} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/admin/knowledge-base/documents/${r.documentId}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {r.documentTitle}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <KBAccessBadge level={r.accessLevel} />
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 border border-border text-grey">
                      {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {(r.heading || r.section) && (
                  <p className="mt-1 text-xs text-grey-dark">
                    {r.section && <span className="text-accent">{r.section}</span>}
                    {r.section && r.heading && <span> / </span>}
                    {r.heading && <span>{r.heading}</span>}
                    {r.pageNumber != null && <span> · p.{r.pageNumber}</span>}
                  </p>
                )}

                <p className="mt-3 text-sm text-grey leading-relaxed line-clamp-4 whitespace-pre-wrap">
                  {r.content}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

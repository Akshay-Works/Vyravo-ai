"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KBStatusBadge, KBAccessBadge, KBProcessBadge, KBCategoryBadge } from "./Badges";
import { fileSizeLabel } from "@/lib/knowledge-base/format";

interface Doc {
  id: number;
  title: string;
  type: string;
  status: string;
  accessLevel: string;
  categoryId: number | null;
  categoryName: string | null;
  tags: string[] | null;
  version: number;
  fileType: string | null;
  fileSize: number | null;
  originalFileName: string | null;
  processingStatus: string;
  processingError: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Filters {
  search: string;
  status: string;
  category: string;
  type: string;
  access: string;
}

export function KBDocumentList({ initialFilters }: { initialFilters?: Partial<Filters> }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string | null }[]>([]);
  const [filters, setFilters] = useState<Filters>({
    search: initialFilters?.search || "",
    status: initialFilters?.status || "",
    category: initialFilters?.category || "",
    type: initialFilters?.type || "",
    access: initialFilters?.access || "",
  });
  const [debounced, setDebounced] = useState(filters);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 400);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    setDebounced((d) => ({ ...d, ...filters }));
  }, [filters.status, filters.category, filters.type, filters.access]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-base/categories");
      const json = await res.json();
      if (json.categories) setCategories(json.categories);
    } catch {}
  }, []);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (debounced.search) params.set("search", debounced.search);
      if (debounced.status) params.set("status", debounced.status);
      if (debounced.category) params.set("category", debounced.category);
      if (debounced.type) params.set("type", debounced.type);
      if (debounced.access) params.set("access", debounced.access);
      params.set("limit", "200");

      const res = await fetch(`/api/knowledge-base/documents?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setDocs(json.documents || []);
      setTotal(json.total || 0);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load documents"));
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleAction = async (id: number, action: string) => {
    if (action === "delete") {
      if (!confirm("Delete this document permanently? This cannot be undone.")) return;
    }
    try {
      let res: Response;
      if (action === "delete") {
        res = await fetch(`/api/knowledge-base/documents/${id}`, { method: "DELETE" });
      } else if (action === "retry") {
        res = await fetch(`/api/knowledge-base/documents/${id}/process`, { method: "POST" });
      } else {
        const statusMap: Record<string, string> = {
          publish: "published",
          unpublish: "draft",
          archive: "archived",
          restore: "draft",
        };
        res = await fetch(`/api/knowledge-base/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: statusMap[action] || action }),
        });
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || `Action failed: ${action}`);
        return;
      }
      loadDocs();
      router.refresh();
    } catch (e: any) {
      alert(`Action failed: ${e?.message}`);
    }
  };

  const typeLabels: Record<string, string> = {
    document: "Document",
    article: "Article",
    faq: "FAQ",
    qa: "Q&A",
    sop: "SOP",
    note: "Note",
    website_content: "Website Content",
    service_doc: "Service Doc",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
            Document <span className="gradient-text">Library</span>
          </h1>
          <p className="mt-2 text-sm text-grey">{total} items in the Knowledge Base</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/knowledge-base/documents/upload" className="btn-primary text-sm">
            📤 Upload
          </Link>
          <Link href="/admin/knowledge-base/articles/new" className="btn-secondary text-sm">
            ✍️ New Article
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="col-span-2 md:col-span-1">
            <input
              type="text"
              placeholder="Search documents..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
            />
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filters.access}
            onChange={(e) => setFilters((f) => ({ ...f, access: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
          >
            <option value="">All Access</option>
            <option value="public">Public</option>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="client-specific">Client-Specific</option>
            <option value="restricted">Restricted</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse h-20 rounded-xl bg-surface border border-border" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-4xl mb-4">📭</p>
          <h3 className="text-lg font-semibold font-[var(--font-heading)]">No documents found</h3>
          <p className="mt-2 text-sm text-grey">
            {filters.search || filters.status || filters.category
              ? "Try adjusting your filters, or upload a document to get started."
              : "Upload your first document to start building the Knowledge Base."}
          </p>
          <Link href="/admin/knowledge-base/documents/upload" className="btn-primary text-sm mt-6 inline-flex">
            📤 Upload Document
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-border bg-surface p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
                {/* File icon */}
                <div className="shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
                  {doc.fileType === "pdf" ? "📄" : doc.fileType === "docx" ? "📝" : doc.fileType === "xlsx" || doc.fileType === "csv" ? "📊" : doc.type === "faq" ? "❓" : doc.type === "sop" ? "📋" : "📚"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/knowledge-base/documents/${doc.id}`}
                      className="font-medium text-white hover:text-primary transition-colors truncate"
                    >
                      {doc.title}
                      {doc.aiGenerated && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">AI</span>
                      )}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <KBStatusBadge status={doc.status} />
                      <KBAccessBadge level={doc.accessLevel} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey-dark">
                    <span>{typeLabels[doc.type] || doc.type}</span>
                    {doc.categoryName && (
                      <span className="inline-flex items-center gap-1">
                        <KBCategoryBadge name={doc.categoryName} />
                      </span>
                    )}
                    {doc.fileType && <span>{doc.fileType.toUpperCase()}</span>}
                    {doc.fileSize != null && <span>{fileSizeLabel(doc.fileSize)}</span>}
                    <span>v{doc.version}</span>
                    <span>Updated {new Date(doc.updatedAt).toLocaleDateString()}</span>
                    <KBProcessBadge status={doc.processingStatus} />
                  </div>
                  {doc.processingError && (
                    <p className="mt-1 text-xs text-red-400 truncate">{doc.processingError}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex lg:flex-col items-center lg:items-end gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/knowledge-base/documents/${doc.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-white hover:border-primary/40 transition-colors"
                    >
                      View
                    </Link>
                    {doc.status === "published" ? (
                      <button
                        onClick={() => handleAction(doc.id, "unpublish")}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-yellow-400 hover:border-yellow-500/40 transition-colors"
                      >
                        Unpublish
                      </button>
                    ) : doc.status === "archived" ? (
                      <button
                        onClick={() => handleAction(doc.id, "restore")}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-green-400 hover:border-green-500/40 transition-colors"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(doc.id, "publish")}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                      >
                        Publish
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(doc.id, "archive")}
                      disabled={doc.status === "archived"}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-orange-400 hover:border-orange-500/40 transition-colors disabled:opacity-40"
                    >
                      Archive
                    </button>
                    {doc.processingStatus === "failed" && (
                      <button
                        onClick={() => handleAction(doc.id, "retry")}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        ↻ Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(doc.id, "delete")}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-red-400 hover:border-red-500/40 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

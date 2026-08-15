"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KBStatusBadge, KBAccessBadge, KBProcessBadge } from "./Badges";
import { fileSizeLabel } from "@/lib/knowledge-base/format";

interface Version {
  id: number;
  version: number;
  title: string;
  changeNote: string | null;
  createdAt: string;
}

export function KBDocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<any>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string | null }[]>([]);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [accessLevel, setAccessLevel] = useState("");
  const [tags, setTags] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge-base/documents/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setDoc(json.document);
        setVersions(json.versions || []);
        setTitle(json.document.title);
        setContent(json.document.content || "");
        setCategoryId(json.document.categoryId ? String(json.document.categoryId) : "");
        setStatus(json.document.status);
        setAccessLevel(json.document.accessLevel);
        setTags((json.document.tags || []).join(", "));
        setSourceUrl(json.document.sourceUrl || "");
      })
      .catch((e) => setError(String(e?.message || "Failed to load")))
      .finally(() => setLoading(false));

    fetch("/api/knowledge-base/categories")
      .then((r) => r.json())
      .then((json) => json.categories && setCategories(json.categories))
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/knowledge-base/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          categoryId: categoryId ? Number(categoryId) : null,
          status,
          accessLevel,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          sourceUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSaveMsg("Saved. Re-indexing content for AI retrieval…");

      // Re-process so embeddings reflect new content
      const procRes = await fetch(`/api/knowledge-base/documents/${id}/process`, {
        method: "POST",
      });
      const procJson = await procRes.json();
      if (procRes.ok) {
        setSaveMsg("Saved and re-indexed successfully.");
      } else {
        setSaveMsg(`Saved, but re-indexing failed: ${procJson.error || "unknown"}. You can retry from the library.`);
      }
      setEditMode(false);
      router.refresh();
    } catch (e: any) {
      setSaveMsg(`Error: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    setProcessing(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/knowledge-base/documents/${id}/process`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Processing failed");
      setSaveMsg(`Re-indexed successfully (${json.chunksCount} chunks).`);
      router.refresh();
    } catch (e: any) {
      setSaveMsg(`Processing error: ${e?.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleStatus = async (newStatus: string) => {
    const res = await fetch(`/api/knowledge-base/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setStatus(newStatus);
      router.refresh();
    }
  };

  if (loading) return <div className="animate-pulse h-64 rounded-xl bg-surface border border-border" />;
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400 text-sm">{error}</div>;
  if (!doc) return null;

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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/admin/knowledge-base/documents" className="text-xs text-grey hover:text-white transition-colors">
              ← Document Library
            </Link>
          </div>
          {!editMode ? (
            <>
              <h1 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)] break-words">{doc.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <KBStatusBadge status={status} />
                <KBAccessBadge level={doc.accessLevel} />
                <KBProcessBadge status={doc.processingStatus} />
                <span className="text-xs text-grey-dark">
                  v{doc.version} · {typeLabels[doc.type] || doc.type}
                </span>
                {doc.aiGenerated && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">AI Generated</span>
                )}
              </div>
              <div className="mt-2 text-xs text-grey-dark flex flex-wrap gap-x-4 gap-y-1">
                {doc.fileType && <span>{doc.fileType.toUpperCase()}</span>}
                {doc.fileSize != null && <span>{fileSizeLabel(doc.fileSize)}</span>}
                {doc.originalFileName && <span className="truncate">{doc.originalFileName}</span>}
                <span>Created {new Date(doc.createdAt).toLocaleDateString()}</span>
                <span>Updated {new Date(doc.updatedAt).toLocaleDateString()}</span>
                {doc.sourceUrl && (
                  <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Source ↗
                  </a>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {!editMode && (
            <button onClick={() => setEditMode(true)} className="btn-primary text-sm">✏️ Edit</button>
          )}
          {editMode && (
            <>
              <button
                onClick={() => { setEditMode(false); setTitle(doc.title); setContent(doc.content || ""); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                {saving ? "Saving…" : "💾 Save & Re-index"}
              </button>
            </>
          )}
          <button onClick={handleReprocess} disabled={processing} className="btn-secondary text-sm disabled:opacity-50">
            {processing ? "Processing…" : "↻ Reprocess"}
          </button>
          {status !== "published" && (
            <button onClick={() => handleStatus("published")} className="text-sm px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
              Publish
            </button>
          )}
          {status === "published" && (
            <button onClick={() => handleStatus("draft")} className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-yellow-400 transition-colors">
              Unpublish
            </button>
          )}
          {status !== "archived" && (
            <button onClick={() => handleStatus("archived")} className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-orange-400 transition-colors">
              Archive
            </button>
          )}
        </div>
      </div>

      {saveMsg && (
        <div className={`rounded-xl border p-4 text-sm ${saveMsg.startsWith("Error") || saveMsg.includes("failed") ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : "border-green-500/30 bg-green-500/10 text-green-400"}`}>
          {saveMsg}
        </div>
      )}

      {/* Editor or content view */}
      {editMode ? (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-grey mb-2">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-grey mb-2">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
              >
                <option value="draft">Draft</option>
                <option value="review">Review</option>
                <option value="approved">Approved</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-grey mb-2">Access Level</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
              >
                <option value="public">Public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="client-specific">Client-Specific</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Source URL</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Content (Markdown supported)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white font-mono text-sm focus:outline-none focus:border-primary/50 resize-y"
              placeholder="Write or paste the document content here…"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
          {doc.content ? (
            <div className="prose-invert max-w-none text-grey leading-relaxed whitespace-pre-wrap text-sm">
              {doc.content.slice(0, 20000)}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">📄</p>
              <p className="text-sm text-grey">
                {doc.processingStatus === "ready"
                  ? "No text content stored. Reprocess to extract content."
                  : doc.processingStatus === "failed"
                  ? `Processing failed: ${doc.processingError || "unknown error"}`
                  : "This document hasn't been processed yet."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      {versions.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Version History</h2>
          </div>
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white">Version {v.version}</p>
                  {v.changeNote && <p className="text-xs text-grey-dark mt-0.5">{v.changeNote}</p>}
                </div>
                <span className="text-xs text-grey-dark">
                  {new Date(v.createdAt).toLocaleDateString()} {new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

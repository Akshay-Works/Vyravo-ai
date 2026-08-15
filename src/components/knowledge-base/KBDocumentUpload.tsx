"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDropzone } from "react-dropzone";

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

const MAX_SIZE = 25 * 1024 * 1024;

export function KBDocumentUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string | null }[]>([]);
  const [accessLevel, setAccessLevel] = useState("internal");
  const [status, setStatus] = useState("draft");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string; id?: number }[]>([]);
  const [error, setError] = useState("");

  // Load categories
  useEffect(() => {
    fetch("/api/knowledge-base/categories")
      .then((r) => r.json())
      .then((json) => json.categories && setCategories(json.categories))
      .catch(() => {});
  }, []);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const valid = accepted.filter((f) => f.size <= MAX_SIZE);
    if (rejected.length > 0) {
      const tooBig = rejected.filter((r) => r.errors?.some((e: any) => e.code === "file-too-large"));
      const badType = rejected.filter((r) => r.errors?.some((e: any) => e.code === "file-invalid-type"));
      if (tooBig.length) setError("One or more files exceed the 25 MB limit.");
      if (badType.length) setError("Unsupported file type. Supported: PDF, DOCX, TXT, Markdown, CSV, XLSX.");
    }
    if (valid.length) {
      setFiles((prev) => [...prev, ...valid]);
      setError("");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const handleUpload = async () => {
    if (files.length === 0) {
      setError("Please select at least one file.");
      return;
    }

    setUploading(true);
    setError("");
    const newResults: typeof results = [];

    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (title) fd.append("title", title);
        if (categoryId) fd.append("categoryId", categoryId);
        fd.append("accessLevel", accessLevel);
        fd.append("status", status);
        if (sourceUrl) fd.append("sourceUrl", sourceUrl);
        if (tags) fd.append("tags", tags);

        const res = await fetch("/api/knowledge-base/upload", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          newResults.push({ name: file.name, ok: false, error: json.error || "Upload failed" });
        } else {
          newResults.push({
            name: file.name,
            ok: true,
            id: json.id,
            error: json.processing?.error,
          });
        }
      } catch (e: any) {
        newResults.push({ name: file.name, ok: false, error: String(e?.message || "Upload failed") });
      }
    }

    setResults(newResults);
    setUploading(false);
    setFiles([]);
    setTitle("");
    setSourceUrl("");
    setTags("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          Upload <span className="gradient-text">Documents</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Upload files to the Knowledge Base. We extract text, chunk it, generate embeddings, and index it for AI retrieval.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border bg-surface hover:border-primary/40"
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-5xl mb-4">{isDragActive ? "📂" : "📤"}</div>
        <p className="text-lg font-medium font-[var(--font-heading)]">
          {isDragActive ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="mt-2 text-sm text-grey">or click to browse</p>
        <p className="mt-4 text-xs text-grey-dark">
          Supported: PDF, DOCX, TXT, Markdown, CSV, XLSX · Max 25 MB per file
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Selected files */}
      {files.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-medium">
            {files.length} file{files.length > 1 ? "s" : ""} selected
          </div>
          <ul className="divide-y divide-border">
            {files.map((file, i) => (
              <li key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">📄</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-grey-dark">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-grey hover:text-red-400 hover:border-red-500/40 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata form */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-5">Document Metadata</h2>
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-grey mb-2">Title (optional — defaults to filename)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AI Chatbot Service Documentation"
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              <option value="">Select category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Access Level</label>
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              <option value="public">Public (visible to customer-facing AI)</option>
              <option value="internal">Internal (default)</option>
              <option value="confidential">Confidential</option>
              <option value="client-specific">Client-Specific</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Initial Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-grey mb-2">Source URL (optional)</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-grey mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="chatbot, sales, onboarding"
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0}
          className="btn-primary mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Uploading & processing…" : `Upload ${files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : ""}`}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-medium">Upload Results</div>
          <ul className="divide-y divide-border">
            {results.map((r, i) => (
              <li key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span>{r.ok ? "✅" : "❌"}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{r.name}</p>
                    {r.error && <p className="text-xs text-orange-400">{r.error}</p>}
                  </div>
                </div>
                {r.ok && r.id ? (
                  <Link
                    href={`/admin/knowledge-base/documents/${r.id}`}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                  >
                    View →
                  </Link>
                ) : (
                  <span className="text-xs text-red-400">Failed</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

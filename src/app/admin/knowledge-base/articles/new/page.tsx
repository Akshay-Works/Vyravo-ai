"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const TYPES = [
  { value: "article", label: "Knowledge Article" },
  { value: "faq", label: "FAQ" },
  { value: "qa", label: "Q&A Pair" },
  { value: "sop", label: "SOP" },
  { value: "note", label: "Note" },
  { value: "website_content", label: "Website Content" },
  { value: "service_doc", label: "Service Documentation" },
  { value: "document", label: "Document" },
];

export default function NewArticlePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: number; name: string; icon: string | null }[]>([]);
  const [form, setForm] = useState({
    title: "",
    content: "",
    type: "article",
    categoryId: "",
    accessLevel: "internal",
    status: "draft",
    tags: "",
    sourceUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/knowledge-base/categories")
      .then((r) => r.json())
      .then((json) => json.categories && setCategories(json.categories))
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/knowledge-base/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          type: form.type,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          accessLevel: form.accessLevel,
          status: form.status,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          sourceUrl: form.sourceUrl || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      router.push(`/admin/knowledge-base/documents/${json.id}`);
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message || "Failed to create article"));
      setSaving(false);
    }
  };

  const handleAiAssist = async () => {
    // Generate a draft via the assistant (stays a draft — human approval required)
    const prompt = `Draft a concise, professional knowledge article titled "${form.title}" for Vyravo AI. Include clear sections.`;
    setError("");
    try {
      const res = await fetch("/api/knowledge-base/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, accessLevels: ["internal", "public"] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI assist failed");
      if (json.answer && !json.answer.includes("I don't have enough information")) {
        setForm((f) => ({ ...f, content: (f.content ? f.content + "\n\n" : "") + json.answer }));
      } else {
        setError("The AI couldn't draft from existing knowledge. Write the article manually.");
      }
    } catch (e: any) {
      setError(String(e?.message || "AI assist failed"));
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin/knowledge-base/articles" className="text-xs text-grey hover:text-white transition-colors">
            ← Articles
          </Link>
        </div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          New <span className="gradient-text">Article</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Create knowledge manually. Content stays a draft until you publish it — AI drafts require human approval before they enter the approved KB.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-grey mb-2">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. What services does Vyravo AI offer?"
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Access Level</label>
            <select
              value={form.accessLevel}
              onChange={(e) => setForm((f) => ({ ...f, accessLevel: e.target.value }))}
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

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-grey focus:outline-none focus:border-primary/50"
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-grey mb-2">Tags (comma separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="onboarding, sales, chatbot"
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-grey mb-2">Source URL (optional)</label>
          <input
            type="url"
            value={form.sourceUrl}
            onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
            placeholder="https://…"
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-grey">Content (Markdown supported)</label>
            <button
              type="button"
              onClick={handleAiAssist}
              className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors"
            >
              ✨ AI Draft
            </button>
          </div>
          <textarea
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={18}
            className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white font-mono text-sm focus:outline-none focus:border-primary/50 resize-y"
            placeholder="## Section
Write the article content here. Use Markdown for structure — the chunker preserves headings and sections for AI retrieval."
          />
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl border border-orange-500/30 bg-orange-500/10 text-sm text-orange-400">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Creating…" : "Create Article"}
          </button>
          <Link href="/admin/knowledge-base/articles" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

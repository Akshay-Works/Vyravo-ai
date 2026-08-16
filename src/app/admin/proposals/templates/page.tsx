"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Template {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  content: { sections: { id: string; title: string; type: string }[] } | null;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/proposals/templates");
    const j = await res.json();
    setTemplates(j.templates || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/proposals/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, category: "custom" }),
    });
    setName(""); setDescription(""); setSaving(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin/proposals" className="text-xs text-grey hover:text-white transition-colors">← Proposals</Link>
        </div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          Proposal <span className="gradient-text">Templates</span>
        </h1>
        <p className="mt-2 text-sm text-grey">Reusable structures for common proposal types.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Create Custom Template</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name…"
            className="flex-1 px-3 py-2.5 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description…"
            className="flex-1 px-3 py-2.5 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
          <button onClick={create} disabled={saving || !name.trim()} className="btn-primary text-sm disabled:opacity-50">＋ Create</button>
        </div>
        <p className="mt-2 text-xs text-grey-dark">Custom templates start with a blank section list — you shape the structure in the proposal editor.</p>
      </div>

      {loading ? <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-surface p-5 card-hover">
              <p className="text-xs uppercase tracking-wider text-grey-dark">{t.category}</p>
              <h3 className="mt-2 text-lg font-semibold font-[var(--font-heading)]">{t.name}</h3>
              <p className="mt-1 text-sm text-grey">{t.description}</p>
              <p className="mt-3 text-xs text-grey-dark">{t.content?.sections?.length || 0} sections</p>
              <Link href={`/admin/proposals/new`} className="mt-4 inline-block text-sm text-primary hover:underline">Use template →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

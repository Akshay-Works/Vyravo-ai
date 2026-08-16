"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Template {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  content: { sections: { id: string; title: string; type: string }[] } | null;
}

export default function NewProposalPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    companyName: "",
    clientEmail: "",
    clientPhone: "",
    clientWebsite: "",
    industry: "",
    projectDescription: "",
    businessProblems: "",
    goals: "",
    requirements: "",
    templateId: "",
    expiryDays: 14,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/proposals/templates").then((r) => r.json()).then((j) => setTemplates(j.templates || [])).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) { setError("Proposal title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const template = templates.find((t) => String(t.id) === form.templateId);
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          clientName: form.clientName,
          companyName: form.companyName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone,
          clientWebsite: form.clientWebsite,
          industry: form.industry,
          projectDescription: form.projectDescription,
          businessProblems: form.businessProblems.split("\n").map((s) => s.trim()).filter(Boolean),
          goals: form.goals.split("\n").map((s) => s.trim()).filter(Boolean),
          requirements: form.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
          templateId: form.templateId ? Number(form.templateId) : undefined,
          templateContent: template?.content || null,
          expiryDays: Number(form.expiryDays) || 14,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create");
      router.push(`/admin/proposals/${json.id}/edit`);
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message || "Failed to create proposal"));
      setSaving(false);
    }
  };

  const inputCls = "w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50";
  const labelCls = "block text-sm font-medium text-grey mb-2";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin/proposals" className="text-xs text-grey hover:text-white transition-colors">← Proposals</Link>
        </div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
          New <span className="gradient-text">Proposal</span>
        </h1>
        <p className="mt-2 text-sm text-grey">
          Start from a template, fill in client details, then use the editor to generate with AI, price, and refine.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div>
          <label className={labelCls}>Proposal Title *</label>
          <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. AI Automation Proposal — Sunrise Realty" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Client Name</label>
            <input className={inputCls} value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Sarah Mitchell" />
          </div>
          <div>
            <label className={labelCls}>Company</label>
            <input className={inputCls} value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="Sunrise Realty" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} placeholder="sarah@sunriserealty.com" />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} placeholder="+1 555 000 1234" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={form.clientWebsite} onChange={(e) => setForm((f) => ({ ...f, clientWebsite: e.target.value }))} placeholder="https://…" />
          </div>
          <div>
            <label className={labelCls}>Industry</label>
            <input className={inputCls} value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Real Estate" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Project Description</label>
          <textarea className={`${inputCls} resize-y`} rows={3} value={form.projectDescription} onChange={(e) => setForm((f) => ({ ...f, projectDescription: e.target.value }))}
            placeholder="What is this project about?" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Business Problems (one per line)</label>
            <textarea className={`${inputCls} resize-y`} rows={4} value={form.businessProblems} onChange={(e) => setForm((f) => ({ ...f, businessProblems: e.target.value }))}
              placeholder={"Leads take 24h+ to follow up\nNo 24/7 answering" } />
          </div>
          <div>
            <label className={labelCls}>Goals (one per line)</label>
            <textarea className={`${inputCls} resize-y`} rows={4} value={form.goals} onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
              placeholder={"Answer every call\nQualify leads automatically"} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Requirements / Timeline Notes</label>
          <textarea className={`${inputCls} resize-y`} rows={2} value={form.requirements} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
            placeholder="e.g. Live within 6 weeks; integrate with HubSpot" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Template</label>
            <select className={inputCls} value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
              <option value="">Blank proposal</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Proposal Expiry (days)</label>
            <input className={inputCls} type="number" min={1} max={90} value={form.expiryDays} onChange={(e) => setForm((f) => ({ ...f, expiryDays: Number(e.target.value) }))} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Internal Notes</label>
          <textarea className={`${inputCls} resize-y`} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal only — never shown to the client" />
        </div>

        {error && <div className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">{error}</div>}

        <div className="flex gap-3 pt-2">
          <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? "Creating…" : "Create Proposal"}
          </button>
          <Link href="/admin/proposals" className="btn-secondary">Cancel</Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SERVICE_CATALOG, type ProposalContent, type ProposalSection, type ProposalService, type ProposalMilestone } from "@/lib/proposals/types";
import { formatMoney } from "@/lib/proposals/format";

const DEFAULT_PRICING = {
  currency: "USD", implementation: 0, monthlyRetainer: 0, addons: [], discount: 0, taxRate: 0, total: 0, monthlyTotal: 0,
};

const SECTION_TYPES = ["prose", "list", "divider"] as const;
const SECTION_IDS: { id: string; label: string }[] = [
  { id: "executive_summary", label: "Executive Summary" },
  { id: "understanding", label: "Understanding of Your Business" },
  { id: "challenges", label: "Current Challenges" },
  { id: "goals", label: "Goals & Objectives" },
  { id: "solution", label: "Proposed Solution" },
  { id: "recommended_systems", label: "Recommended AI Systems" },
  { id: "scope", label: "Scope of Work" },
  { id: "deliverables", label: "Deliverables" },
  { id: "implementation", label: "Implementation Process" },
  { id: "timeline", label: "Timeline" },
  { id: "investment", label: "Investment" },
  { id: "addons", label: "Optional Add-ons" },
  { id: "support", label: "Support & Maintenance" },
  { id: "why_vyravo", label: "Why Vyravo AI" },
  { id: "case_studies", label: "Relevant Case Studies" },
  { id: "terms", label: "Terms & Conditions" },
];

const MILESTONE_PRESETS = [
  { label: "100% upfront", percents: [100] },
  { label: "50% / 50%", percents: [50, 50] },
  { label: "40% / 30% / 30%", percents: [40, 30, 30] },
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ProposalEditor({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genNote, setGenNote] = useState("");
  const [preview, setPreview] = useState(false);

  const [meta, setMeta] = useState({
    title: "", clientName: "", companyName: "", clientEmail: "", clientPhone: "",
    clientWebsite: "", industry: "", projectDescription: "", notes: "",
    businessProblems: "", goals: "", requirements: "",
  });
  const [content, setContent] = useState<ProposalContent>({
    sections: [], services: [], pricing: { ...DEFAULT_PRICING },
    milestones: [], timeline: "", paymentTerms: "", supportTerms: "", expiryDays: 14, addons: [],
  });
  const [serviceNames, setServiceNames] = useState<string[]>([]);
  const [status, setStatus] = useState("draft");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      const p = json.proposal;
      setMeta({
        title: p.title || "", clientName: p.clientName || "", companyName: p.companyName || "",
        clientEmail: p.clientEmail || "", clientPhone: p.clientPhone || "", clientWebsite: p.clientWebsite || "",
        industry: p.industry || "", projectDescription: p.projectDescription || "", notes: p.notes || "",
        businessProblems: (p.businessProblems || []).join("\n"), goals: (p.goals || []).join("\n"), requirements: (p.requirements || []).join("\n"),
      });
      setStatus(p.status || "draft");
      setServiceNames((p.selectedServices || []).map((s: any) => s.name || s));
      const c = p.proposalContent || {
        sections: [], services: [], pricing: { ...DEFAULT_PRICING },
        milestones: [], timeline: "", paymentTerms: "", supportTerms: "", expiryDays: p.expiryDays || 14, addons: [],
      };
      setContent({
        sections: c.sections || [],
        services: c.services || [],
        pricing: { ...DEFAULT_PRICING, ...(c.pricing || {}) },
        milestones: c.milestones || [],
        timeline: c.timeline || "", paymentTerms: c.paymentTerms || "", supportTerms: c.supportTerms || "",
        expiryDays: c.expiryDays || p.expiryDays || 14, addons: c.addons || [],
      });
    } catch (e: any) {
      setError(String(e?.message || "Failed to load proposal"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const totals = useCallback(() => {
    const pricing = content.pricing;
    const subtotal = (pricing.implementation || 0) + (pricing.addons || []).reduce((s, a) => s + (a.price || 0), 0);
    const afterDiscount = Math.max(0, subtotal - (pricing.discount || 0));
    const tax = afterDiscount * ((pricing.taxRate || 0) / 100);
    const total = Math.round((afterDiscount + tax) * 100) / 100;
    return { subtotal, total, tax, afterDiscount };
  }, [content.pricing]);

  const updatePricing = (patch: Partial<ProposalContent["pricing"]>) => {
    setContent((c) => ({ ...c, pricing: { ...c.pricing, ...patch } }));
  };

  const syncMilestones = (percents: number[]) => {
    const total = totals().total || 0;
    const ms: ProposalMilestone[] = percents.map((pct, i) => ({
      id: uid(),
      label: i === 0 ? "Upfront deposit" : i === percents.length - 1 ? "On completion" : `Milestone ${i}`,
      percent: pct,
      amount: Math.round(total * pct) / 100,
    }));
    setContent((c) => ({ ...c, milestones: ms }));
  };

  const addService = (name: string) => {
    if (!name || content.services.some((s) => s.name === name)) return;
    const svc: ProposalService = { id: uid(), name, implementationFee: 0, monthlyRecurring: 0 };
    setContent((c) => ({
      ...c,
      services: [...c.services, svc],
      pricing: { ...c.pricing, implementation: (c.pricing.implementation || 0) + 0 },
    }));
    setServiceNames((prev) => [...prev, name]);
  };

  const updateService = (idx: number, patch: Partial<ProposalService>) => {
    setContent((c) => {
      const services = [...c.services];
      services[idx] = { ...services[idx], ...patch };
      const implementation = services.reduce((s, x) => s + (x.implementationFee || 0), 0);
      const monthlyRetainer = services.reduce((s, x) => s + (x.monthlyRecurring || 0), 0);
      return { ...c, services, pricing: { ...c.pricing, implementation, monthlyRetainer } };
    });
  };

  const removeService = (idx: number) => {
    setContent((c) => {
      const services = c.services.filter((_, i) => i !== idx);
      return {
        ...c,
        services,
        pricing: {
          ...c.pricing,
          implementation: services.reduce((s, x) => s + (x.implementationFee || 0), 0),
          monthlyRetainer: services.reduce((s, x) => s + (x.monthlyRecurring || 0), 0),
        },
      };
    });
    setServiceNames((prev) => prev.filter((_, i) => i !== idx));
  };

  const addSection = (sectionId?: string, type: string = "prose") => {
    const id = sectionId || `custom-${uid()}`;
    const label = SECTION_IDS.find((s) => s.id === id)?.label || "New Section";
    const section: ProposalSection = { id, title: label, type: type as any, content: "", items: [] };
    setContent((c) => ({ ...c, sections: [...c.sections, section] }));
  };

  const updateSection = (idx: number, patch: Partial<ProposalSection>) => {
    setContent((c) => {
      const sections = [...c.sections];
      sections[idx] = { ...sections[idx], ...patch };
      return { ...c, sections };
    });
  };

  const removeSection = (idx: number) => {
    setContent((c) => ({ ...c, sections: c.sections.filter((_, i) => i !== idx) }));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setContent((c) => {
      const sections = [...c.sections];
      const target = idx + dir;
      if (target < 0 || target >= sections.length) return c;
      [sections[idx], sections[target]] = [sections[target], sections[idx]];
      return { ...c, sections };
    });
  };

  const generateWithAI = async () => {
    setGenerating(true);
    setGenNote("");
    try {
      const res = await fetch(`/api/proposals/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: serviceNames }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setContent((c) => ({
        ...json.content,
        pricing: c.pricing,
        milestones: c.milestones,
        expiryDays: c.expiryDays,
      }));
      setGenNote(json.warnings?.join(" ") || "Draft generated — human review required before sending.");
      await load();
    } catch (e: any) {
      setGenNote(`Generation error: ${e?.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const save = async (extraStatus?: string) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: meta.title,
          clientName: meta.clientName, companyName: meta.companyName, clientEmail: meta.clientEmail,
          clientPhone: meta.clientPhone, clientWebsite: meta.clientWebsite, industry: meta.industry,
          projectDescription: meta.projectDescription, notes: meta.notes,
          businessProblems: meta.businessProblems.split("\n").map((s) => s.trim()).filter(Boolean),
          goals: meta.goals.split("\n").map((s) => s.trim()).filter(Boolean),
          requirements: meta.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
          content,
          status: extraStatus || undefined,
          changeNote: extraStatus === "approved" ? "Approved after human review" : "Edited",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      if (extraStatus) setStatus(extraStatus);
      router.refresh();
    } catch (e: any) {
      setError(String(e?.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="animate-pulse h-96 rounded-xl bg-surface border border-border" />;
  if (error && !meta.title) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400 text-sm">{error}</div>;

  const { subtotal, tax, total } = totals();
  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50";
  const labelCls = "block text-xs font-medium text-grey mb-1.5";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/proposals" className="text-xs text-grey hover:text-white">← Proposals</Link>
            <span className="text-grey-dark">/</span>
            <Link href={`/admin/proposals/${id}`} className="text-xs text-grey hover:text-white">View</Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">{meta.title || "Untitled Proposal"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={generateWithAI} disabled={generating} className="text-sm px-3 py-2 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-50">
            {generating ? "Generating…" : "✨ Generate with AI"}
          </button>
          <button onClick={() => setPreview(!preview)} className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors">
            {preview ? "Edit" : "👁 Preview"}
          </button>
          <button onClick={() => save()} disabled={saving} className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "💾 Save Draft"}
          </button>
          {status === "draft" && (
            <button onClick={() => save("approved")} disabled={saving} className="text-sm px-3 py-2 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50">
              ✓ Approve
            </button>
          )}
          <button onClick={() => save("in_review")} disabled={saving} className="text-sm px-3 py-2 rounded-lg border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-50">
            Send to Review
          </button>
          <a href={`/api/proposals/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors">📄 PDF</a>
        </div>
      </div>

      {genNote && (
        <div className={`rounded-xl border p-4 text-sm ${genNote.startsWith("Generation error") ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-purple-500/30 bg-purple-500/10 text-purple-300"}`}>
          {genNote}
        </div>
      )}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}

      {preview ? (
        <ProposalPreviewView content={content} meta={meta} total={total} />
      ) : (
        <div className="space-y-6">
          {/* Client + project info */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Client & Project</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                ["title", "Proposal Title *"], ["clientName", "Client Name"], ["companyName", "Company"],
                ["clientEmail", "Email"], ["clientPhone", "Phone"], ["clientWebsite", "Website"], ["industry", "Industry"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <input className={inputCls} value={meta[key]} onChange={(e) => setMeta((m) => ({ ...m, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className={labelCls}>Project Description</label>
              <textarea className={`${inputCls} resize-y`} rows={2} value={meta.projectDescription} onChange={(e) => setMeta((m) => ({ ...m, projectDescription: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls}>Business Problems (one per line)</label>
                <textarea className={`${inputCls} resize-y`} rows={4} value={meta.businessProblems} onChange={(e) => setMeta((m) => ({ ...m, businessProblems: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Goals (one per line)</label>
                <textarea className={`${inputCls} resize-y`} rows={4} value={meta.goals} onChange={(e) => setMeta((m) => ({ ...m, goals: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelCls}>Requirements / Timeline</label>
              <textarea className={`${inputCls} resize-y`} rows={2} value={meta.requirements} onChange={(e) => setMeta((m) => ({ ...m, requirements: e.target.value }))} />
            </div>
            <div className="mt-4">
              <label className={labelCls}>Internal Notes (never shown to client)</label>
              <textarea className={`${inputCls} resize-y`} rows={2} value={meta.notes} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))} />
            </div>
          </div>

          {/* Services + pricing */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Services & Investment</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {SERVICE_CATALOG.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => addService(s.name)}
                  disabled={content.services.some((x) => x.name === s.name)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-grey hover:text-white hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ＋ {s.name}
                </button>
              ))}
            </div>

            {content.services.length === 0 ? (
              <p className="text-sm text-grey-dark">No services selected. Add services above, or use ✨ Generate with AI.</p>
            ) : (
              <div className="space-y-3">
                {content.services.map((svc, i) => (
                  <div key={svc.id} className="rounded-lg bg-bg border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <input className={`${inputCls} font-medium`} value={svc.name} onChange={(e) => updateService(i, { name: e.target.value })} />
                      <button onClick={() => removeService(i)} className="text-xs px-2 py-1 rounded border border-border text-grey hover:text-red-400 transition-colors">Remove</button>
                    </div>
                    <textarea className={`${inputCls} mt-2 resize-y`} rows={2} placeholder="Description / scope"
                      value={svc.description || ""} onChange={(e) => updateService(i, { description: e.target.value })} />
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className={labelCls}>Implementation Fee ({content.pricing.currency})</label>
                        <input className={inputCls} type="number" min={0} value={svc.implementationFee ?? 0}
                          onChange={(e) => updateService(i, { implementationFee: Number(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label className={labelCls}>Monthly Recurring ({content.pricing.currency}/mo)</label>
                        <input className={inputCls} type="number" min={0} value={svc.monthlyRecurring ?? 0}
                          onChange={(e) => updateService(i, { monthlyRecurring: Number(e.target.value) || 0 })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pricing calculator */}
            <div className="mt-6 rounded-lg border border-border bg-bg p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Pricing Calculator <span className="text-xs text-grey-dark font-normal">(internal)</span></h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Implementation Total</label>
                  <p className="text-xl font-semibold font-[var(--font-heading)]">{formatMoney(content.pricing.implementation, content.pricing.currency)}</p>
                </div>
                <div>
                  <label className={labelCls}>Add-on</label>
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="Name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const name = (e.target as HTMLInputElement).value.trim();
                          if (name) { updatePricing({ addons: [...(content.pricing.addons || []), { name, price: 0 }] }); (e.target as HTMLInputElement).value = ""; }
                        }
                      }} />
                  </div>
                  {(content.pricing.addons || []).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-grey flex-1 truncate">{a.name}</span>
                      <input className={`${inputCls} w-24 text-right`} type="number" min={0} value={a.price}
                        onChange={(e) => {
                          const addons = [...(content.pricing.addons || [])];
                          addons[i] = { ...addons[i], price: Number(e.target.value) || 0 };
                          updatePricing({ addons });
                        }} />
                    </div>
                  ))}
                </div>
                <div>
                  <label className={labelCls}>Discount ({content.pricing.currency})</label>
                  <input className={inputCls} type="number" min={0} value={content.pricing.discount}
                    onChange={(e) => updatePricing({ discount: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className={labelCls}>Tax Rate (%)</label>
                  <input className={inputCls} type="number" min={0} max={50} step={0.1} value={content.pricing.taxRate}
                    onChange={(e) => updatePricing({ taxRate: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-grey">
                  Subtotal <span className="text-white font-medium">{formatMoney(subtotal, content.pricing.currency)}</span>
                  {content.pricing.discount > 0 && <> · Discount <span className="text-white font-medium">−{formatMoney(content.pricing.discount, content.pricing.currency)}</span></>}
                  {content.pricing.taxRate > 0 && <> · Tax <span className="text-white font-medium">{formatMoney(tax, content.pricing.currency)}</span></>}
                  {content.pricing.monthlyRetainer > 0 && <> · Monthly <span className="text-white font-medium">{formatMoney(content.pricing.monthlyRetainer, content.pricing.currency)}/mo</span></>}
                </div>
                <p className="text-lg font-semibold font-[var(--font-heading)] gradient-text">Total: {formatMoney(total, content.pricing.currency)}</p>
              </div>
            </div>

            {/* Payment milestones */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-white mb-3">Payment Milestones</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {MILESTONE_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => syncMilestones(p.percents)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-grey hover:text-white hover:border-primary/40 transition-colors">
                    {p.label}
                  </button>
                ))}
                <button onClick={() => syncMilestones([100])} className="text-xs px-3 py-1.5 rounded-full border border-border text-grey hover:text-white transition-colors">Custom…</button>
              </div>
              {content.milestones.length > 0 && (
                <div className="space-y-2">
                  {content.milestones.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg bg-bg border border-border p-3">
                      <input className={`${inputCls} flex-1`} value={m.label} onChange={(e) => {
                        const milestones = [...content.milestones]; milestones[i] = { ...milestones[i], label: e.target.value };
                        setContent((c) => ({ ...c, milestones }));
                      }} />
                      <div className="flex items-center gap-2">
                        <input className={`${inputCls} w-20 text-right`} type="number" min={0} max={100} value={m.percent}
                          onChange={(e) => {
                            const milestones = [...content.milestones];
                            const pct = Math.min(100, Number(e.target.value) || 0);
                            milestones[i] = { ...milestones[i], percent: pct, amount: Math.round(total * pct) / 100 };
                            setContent((c) => ({ ...c, milestones }));
                          }} />
                        <span className="text-xs text-grey-dark">%</span>
                        <span className="text-sm text-grey w-24 text-right">{formatMoney(m.amount, content.pricing.currency)}</span>
                        <button onClick={() => {
                          setContent((c) => ({ ...c, milestones: c.milestones.filter((_, x) => x !== i) }));
                        }} className="text-xs text-grey hover:text-red-400">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Terms */}
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <div>
                <label className={labelCls}>Payment Terms</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={content.paymentTerms}
                  onChange={(e) => setContent((c) => ({ ...c, paymentTerms: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Support Terms</label>
                <textarea className={`${inputCls} resize-y`} rows={3} value={content.supportTerms}
                  onChange={(e) => setContent((c) => ({ ...c, supportTerms: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Expiry (days)</label>
                <input className={inputCls} type="number" min={1} max={90} value={content.expiryDays}
                  onChange={(e) => setContent((c) => ({ ...c, expiryDays: Number(e.target.value) || 14 }))} />
              </div>
            </div>
          </div>

          {/* Sections editor */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold font-[var(--font-heading)]">Proposal Sections</h2>
              <div className="flex gap-2">
                <select className="text-xs px-2 py-1.5 rounded-lg bg-bg border border-border text-grey"
                  onChange={(e) => { if (e.target.value) addSection(e.target.value); e.target.value = ""; }}>
                  <option value="">＋ Add section…</option>
                  {SECTION_IDS.filter((s) => !content.sections.some((x) => x.id === s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                  <option value="custom">Custom section…</option>
                </select>
                <button onClick={() => addSection("custom")} className="text-xs px-2 py-1.5 rounded-lg border border-border text-grey hover:text-white transition-colors">＋ Custom</button>
              </div>
            </div>

            {content.sections.length === 0 ? (
              <p className="text-sm text-grey-dark">No sections yet — add sections above or generate with AI.</p>
            ) : (
              <div className="space-y-3">
                {content.sections.map((sec, i) => (
                  <div key={`${sec.id}-${i}`} className="rounded-lg bg-bg border border-border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => moveSection(i, -1)} className="text-xs text-grey hover:text-white">↑</button>
                      <button onClick={() => moveSection(i, 1)} className="text-xs text-grey hover:text-white">↓</button>
                      <input className={`${inputCls} flex-1 font-medium`} value={sec.title}
                        onChange={(e) => updateSection(i, { title: e.target.value })} />
                      <select className="text-xs px-2 py-1.5 rounded bg-bg border border-border text-grey"
                        value={sec.type}
                        onChange={(e) => updateSection(i, { type: e.target.value as any })}>
                        {SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => removeSection(i)} className="text-xs text-grey hover:text-red-400">✕</button>
                    </div>
                    {sec.type === "list" ? (
                      <textarea className={`${inputCls} resize-y font-mono text-xs`} rows={4}
                        placeholder={"One item per line"}
                        value={(sec.items || []).join("\n")}
                        onChange={(e) => updateSection(i, { items: e.target.value.split("\n") })} />
                    ) : (
                      <textarea className={`${inputCls} resize-y font-mono text-xs`} rows={5}
                        placeholder="Markdown supported"
                        value={sec.content || ""}
                        onChange={(e) => updateSection(i, { content: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Preview ----
function ProposalPreviewView({ content, meta, total }: { content: ProposalContent; meta: any; total: number }) {
  const ordered = [...content.sections].sort((a, b) => {
    const order = ["cover", "executive_summary", "understanding", "challenges", "goals", "solution", "recommended_systems", "scope", "deliverables", "implementation", "timeline", "investment", "addons", "support", "why_vyravo", "case_studies", "terms", "acceptance", "contact"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Cover */}
      <div className="relative px-8 py-16 text-center bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border">
        <p className="text-sm font-semibold tracking-[0.2em] text-primary">VYRAVO AI</p>
        <h2 className="mt-3 text-3xl font-semibold font-[var(--font-heading)]">{meta.title || "Proposal"}</h2>
        <p className="mt-2 text-sm text-grey">Intelligent Automation for Modern Businesses</p>
        <p className="mt-6 text-primary font-medium">Prepared for {meta.clientName || "[Client Name]"}{meta.companyName ? ` · ${meta.companyName}` : ""}</p>
      </div>
      <div className="p-8 space-y-8">
        {ordered.filter((s) => !["cover", "contact"].includes(s.id)).map((s) => (
          <div key={s.id}>
            {s.id === "investment" || s.type === "pricing" ? (
              <>
                <h3 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Investment</h3>
                <div className="rounded-lg border border-border bg-bg p-4 space-y-2 text-sm">
                  {content.services.filter((x) => x.implementationFee).map((x) => (
                    <div key={x.id} className="flex justify-between"><span className="text-grey">{x.name}</span><span>{formatMoney(x.implementationFee, content.pricing.currency)}</span></div>
                  ))}
                  {(content.pricing.addons || []).map((a, i) => (
                    <div key={i} className="flex justify-between"><span className="text-grey">Add-on: {a.name}</span><span>{formatMoney(a.price, content.pricing.currency)}</span></div>
                  ))}
                  {content.pricing.discount > 0 && <div className="flex justify-between"><span className="text-grey">Discount</span><span>−{formatMoney(content.pricing.discount, content.pricing.currency)}</span></div>}
                  {content.pricing.taxRate > 0 && <div className="flex justify-between"><span className="text-grey">Tax ({content.pricing.taxRate}%)</span><span>{formatMoney((subtotalFor(content) - content.pricing.discount) * content.pricing.taxRate / 100, content.pricing.currency)}</span></div>}
                  <div className="flex justify-between font-semibold border-t border-border pt-2"><span>Total</span><span>{formatMoney(total, content.pricing.currency)}</span></div>
                  {content.pricing.monthlyRetainer > 0 && <div className="flex justify-between text-xs text-grey"><span>Ongoing support</span><span>{formatMoney(content.pricing.monthlyRetainer, content.pricing.currency)}/mo</span></div>}
                  {content.milestones.length > 0 && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-grey-dark mb-1">Payment milestones:</p>
                      {content.milestones.map((m) => <p key={m.id} className="text-xs text-grey">· {m.label} — {m.percent}% ({formatMoney(m.amount, content.pricing.currency)})</p>)}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold font-[var(--font-heading)] mb-2">{s.title}</h3>
                {s.type === "list" ? (
                  <ul className="space-y-1.5 text-sm text-grey">
                    {(s.items || []).map((it, x) => <li key={x}>• {it}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-grey whitespace-pre-wrap leading-relaxed">{s.content || "—"}</p>
                )}
              </>
            )}
          </div>
        ))}
        <div className="border-t border-border pt-6 text-sm text-grey">
          <p className="font-semibold text-white">Vyravo AI</p>
          <p className="mt-1">Phone: +91 9075707650 · Email: akshay.navale.work@gmail.com</p>
          <p>linkedin.com/in/akshay-n-2692851b7</p>
        </div>
      </div>
    </div>
  );
}

function subtotalFor(content: ProposalContent): number {
  const pricing = content.pricing;
  return (pricing.implementation || 0) + (pricing.addons || []).reduce((s, a) => s + (a.price || 0), 0);
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { INDUSTRIES, COMPANY_SIZES, BUDGET_RANGES, TIMELINES } from "@/lib/discovery/types";
import { PIPELINE_STAGES, LEAD_SOURCES } from "@/lib/crm/types";

export default function NewLeadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    businessWebsite: "",
    industry: "",
    companySize: "",
    country: "",
    biggestChallenge: "",
    automationGoals: "",
    budgetRange: "",
    timeline: "",
    stage: "new",
    source: "manual",
    priority: "medium",
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email) return;

    setLoading(true);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/crm/leads/${json.lead.id}`);
      }
    } catch (error) {
      console.error("Failed to create lead:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/crm/leads" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Add New Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Full Name *</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="john@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="+1 555 000 0000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Source</label>
              <select
                value={formData.source}
                onChange={(e) => updateField("source", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source.toLowerCase()}>{source}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Business Info */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Business Information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Business Name</label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Acme Inc."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Website</label>
              <input
                type="url"
                value={formData.businessWebsite}
                onChange={(e) => updateField("businessWebsite", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="https://acme.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Industry</label>
              <select
                value={formData.industry}
                onChange={(e) => updateField("industry", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Company Size</label>
              <select
                value={formData.companySize}
                onChange={(e) => updateField("companySize", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Select size</option>
                {COMPANY_SIZES.map((size) => (
                  <option key={size.value} value={size.value}>{size.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-2">Country</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => updateField("country", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="United States"
              />
            </div>
          </div>
        </div>

        {/* Qualification Info */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Qualification</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Biggest Challenge</label>
              <textarea
                value={formData.biggestChallenge}
                onChange={(e) => updateField("biggestChallenge", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary resize-none"
                placeholder="What's their main pain point?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Automation Goals</label>
              <textarea
                value={formData.automationGoals}
                onChange={(e) => updateField("automationGoals", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary resize-none"
                placeholder="What do they want to automate?"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Budget Range</label>
                <select
                  value={formData.budgetRange}
                  onChange={(e) => updateField("budgetRange", e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select budget</option>
                  {BUDGET_RANGES.map((budget) => (
                    <option key={budget.value} value={budget.value}>{budget.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Timeline</label>
                <select
                  value={formData.timeline}
                  onChange={(e) => updateField("timeline", e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select timeline</option>
                  {TIMELINES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Settings */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Pipeline Settings</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Stage</label>
              <select
                value={formData.stage}
                onChange={(e) => updateField("stage", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage.slug} value={stage.slug}>{stage.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => updateField("priority", e.target.value)}
                className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href="/crm/leads" className="btn-secondary text-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || !formData.fullName || !formData.email}
            className="btn-primary text-sm"
          >
            {loading ? "Creating..." : "Create Lead"}
          </button>
        </div>
      </form>
    </div>
  );
}

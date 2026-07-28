"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PIPELINE_STAGES } from "@/lib/crm/types";

interface Lead {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  businessWebsite: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  biggestChallenge: string | null;
  automationGoals: string | null;
  budgetRange: string | null;
  timeline: string | null;
  leadScore: number;
  leadCategory: string | null;
  leadType: string | null;
  recommendedServices: string[] | null;
  qualificationSummary: string | null;
  stage: string;
  status: string;
  priority: string;
  source: string | null;
  meetingStatus: string | null;
  meetingDate: string | null;
  nextFollowUp: string | null;
  lastContactedAt: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface Activity {
  id: number;
  type: string;
  action: string;
  description: string | null;
  createdAt: string;
}

export function LeadDetailContent({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Lead>>({});

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`);
      const json = await res.json();
      if (json.success) {
        setLead(json.lead);
        setActivities(json.activities || []);
        setFormData(json.lead);
      }
    } catch (error) {
      console.error("Failed to fetch lead:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateLead = async (updates: Partial<Lead>) => {
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json.success) {
        setLead(json.lead);
        setEditing(false);
      }
    } catch (error) {
      console.error("Failed to update lead:", error);
    }
  };

  const updateStage = async (newStage: string) => {
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      const json = await res.json();
      if (json.success) {
        setLead(json.lead);
        fetchLead(); // Refresh activities
      }
    } catch (error) {
      console.error("Failed to update stage:", error);
    }
  };

  const deleteLead = async () => {
    if (!confirm("Are you sure you want to delete this lead?")) return;
    
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        router.push("/crm/leads");
      }
    } catch (error) {
      console.error("Failed to delete lead:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Lead not found</h2>
        <Link href="/crm/leads" className="text-primary hover:underline">
          Back to Leads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/crm/leads"
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-grey" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-semibold">
                {lead.fullName[0]}
              </div>
              <div>
                <h1 className="text-2xl font-semibold font-[var(--font-heading)]">{lead.fullName}</h1>
                <p className="text-sm text-grey">{lead.businessName || lead.email}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(!editing)}
            className="btn-secondary text-sm"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={deleteLead}
            className="px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stage Pipeline */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-4">Pipeline Stage</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {PIPELINE_STAGES.filter((s) => s.slug !== "lost").map((stage) => (
            <button
              key={stage.slug}
              onClick={() => updateStage(stage.slug)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                lead.stage === stage.slug
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/30"
              }`}
            >
              {stage.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lead Score & Category */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Lead Qualification</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-bg">
                <p className="text-3xl font-semibold gradient-text">{lead.leadScore}</p>
                <p className="text-xs text-grey mt-1">Lead Score</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-bg">
                <p className={`text-lg font-semibold capitalize ${
                  lead.leadCategory === "hot" ? "text-red-400" :
                  lead.leadCategory === "warm" ? "text-yellow-400" : "text-grey"
                }`}>
                  {lead.leadCategory === "hot" ? "🔥" : lead.leadCategory === "warm" ? "🌡️" : "❄️"} {lead.leadCategory || "—"}
                </p>
                <p className="text-xs text-grey mt-1">Category</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-bg">
                <p className="text-lg font-semibold capitalize">{lead.leadType?.replace(/_/g, " ") || "—"}</p>
                <p className="text-xs text-grey mt-1">Type</p>
              </div>
            </div>
            {lead.qualificationSummary && (
              <p className="text-sm text-grey mt-4">{lead.qualificationSummary}</p>
            )}
          </div>

          {/* Recommended Services */}
          {lead.recommendedServices && lead.recommendedServices.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold mb-4">Recommended Services</h3>
              <div className="flex flex-wrap gap-2">
                {lead.recommendedServices.map((service, i) => (
                  <span key={i} className="px-3 py-1.5 text-sm rounded-full bg-primary/10 text-primary border border-primary/20">
                    {service}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Business Challenges */}
          {(lead.biggestChallenge || lead.automationGoals) && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-sm font-semibold mb-4">Business Challenges & Goals</h3>
              <div className="space-y-4">
                {lead.biggestChallenge && (
                  <div>
                    <p className="text-xs text-grey uppercase tracking-wider mb-1">Biggest Challenge</p>
                    <p className="text-sm">{lead.biggestChallenge}</p>
                  </div>
                )}
                {lead.automationGoals && (
                  <div>
                    <p className="text-xs text-grey uppercase tracking-wider mb-1">Automation Goals</p>
                    <p className="text-sm">{lead.automationGoals}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Activity Timeline</h3>
            <div className="space-y-4">
              {activities.length > 0 ? (
                activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div>
                      <p className="text-sm">{activity.description || activity.action}</p>
                      <p className="text-xs text-grey mt-1">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-grey">No activity yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-grey">Email</p>
                <a href={`mailto:${lead.email}`} className="text-sm text-primary hover:underline">
                  {lead.email}
                </a>
              </div>
              {lead.phone && (
                <div>
                  <p className="text-xs text-grey">Phone</p>
                  <a href={`tel:${lead.phone}`} className="text-sm text-primary hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.businessWebsite && (
                <div>
                  <p className="text-xs text-grey">Website</p>
                  <a href={lead.businessWebsite} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                    {lead.businessWebsite}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Business Info */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Business Information</h3>
            <div className="space-y-3">
              {lead.businessName && (
                <div>
                  <p className="text-xs text-grey">Company</p>
                  <p className="text-sm">{lead.businessName}</p>
                </div>
              )}
              {lead.industry && (
                <div>
                  <p className="text-xs text-grey">Industry</p>
                  <p className="text-sm capitalize">{lead.industry.replace(/_/g, " ")}</p>
                </div>
              )}
              {lead.companySize && (
                <div>
                  <p className="text-xs text-grey">Company Size</p>
                  <p className="text-sm">{lead.companySize}</p>
                </div>
              )}
              {lead.country && (
                <div>
                  <p className="text-xs text-grey">Country</p>
                  <p className="text-sm">{lead.country}</p>
                </div>
              )}
            </div>
          </div>

          {/* Budget & Timeline */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Budget & Timeline</h3>
            <div className="space-y-3">
              {lead.budgetRange && (
                <div>
                  <p className="text-xs text-grey">Budget Range</p>
                  <p className="text-sm capitalize">{lead.budgetRange.replace(/_/g, " ")}</p>
                </div>
              )}
              {lead.timeline && (
                <div>
                  <p className="text-xs text-grey">Timeline</p>
                  <p className="text-sm capitalize">{lead.timeline.replace(/_/g, " ")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Meta Info */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-4">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-grey">Source</span>
                <span className="capitalize">{lead.source || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-grey">Status</span>
                <span className="capitalize">{lead.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-grey">Created</span>
                <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-grey">Updated</span>
                <span>{new Date(lead.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

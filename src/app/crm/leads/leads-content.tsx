"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES } from "@/lib/crm/types";

interface Lead {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  businessName: string | null;
  industry: string | null;
  leadScore: number;
  leadCategory: string | null;
  stage: string;
  status: string;
  source: string | null;
  createdAt: string;
}

export function LeadsContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => {
    fetchLeads();
  }, [search, stageFilter, categoryFilter]);

  const fetchLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (stageFilter) params.set("stage", stageFilter);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/crm/leads?${params}`);
      const json = await res.json();
      if (json.success) {
        setLeads(json.leads);
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-green-500/20 text-green-400";
    if (score >= 40) return "bg-yellow-500/20 text-yellow-400";
    return "bg-grey/20 text-grey";
  };

  const getCategoryBadge = (category: string | null) => {
    switch (category) {
      case "hot":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">🔥 Hot</span>;
      case "warm":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">🌡️ Warm</span>;
      case "cold":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">❄️ Cold</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Leads</h1>
          <p className="text-sm text-grey mt-1">{leads.length} total leads</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/crm/pipeline" className="btn-secondary text-sm">
            Pipeline View
          </Link>
          <Link href="/crm/leads/new" className="btn-primary text-sm">
            + New Lead
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-grey-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-surface border border-border rounded-lg text-white placeholder-grey-dark focus:border-primary outline-none"
            />
          </div>
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-4 py-2.5 text-sm bg-surface border border-border rounded-lg text-white focus:border-primary outline-none"
        >
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map((stage) => (
            <option key={stage.slug} value={stage.slug}>{stage.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 text-sm bg-surface border border-border rounded-lg text-white focus:border-primary outline-none"
        >
          <option value="">All Categories</option>
          <option value="hot">🔥 Hot</option>
          <option value="warm">🌡️ Warm</option>
          <option value="cold">❄️ Cold</option>
        </select>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-lg font-semibold mb-2">No leads found</h3>
            <p className="text-sm text-grey mb-4">
              {search || stageFilter || categoryFilter
                ? "Try adjusting your filters"
                : "Start adding leads to your CRM"}
            </p>
            <Link href="/crm/leads/new" className="btn-primary text-sm">
              + Add First Lead
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-grey uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/crm/leads/${lead.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                          {lead.fullName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium group-hover:text-primary transition-colors">{lead.fullName}</p>
                          <p className="text-xs text-grey">{lead.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{lead.businessName || "—"}</p>
                      <p className="text-xs text-grey">{lead.industry || "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getScoreColor(lead.leadScore)}`}>
                          {lead.leadScore}
                        </span>
                        {getCategoryBadge(lead.leadCategory)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize">{lead.stage?.replace(/_/g, " ") || "new"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-grey">{lead.source || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-grey">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/crm/leads/${lead.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

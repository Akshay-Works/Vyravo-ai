"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PIPELINE_STAGES } from "@/lib/crm/types";

interface Lead {
  id: number;
  fullName: string;
  email: string;
  businessName: string | null;
  leadScore: number;
  leadCategory: string | null;
  stage: string;
  createdAt: string;
}

export function PipelineContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/crm/leads?limit=100");
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

  const getLeadsForStage = (stageSlug: string) => {
    return leads.filter((lead) => lead.stage === stageSlug);
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    if (!draggedLead || draggedLead.stage === targetStage) {
      setDraggedLead(null);
      return;
    }

    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === draggedLead.id ? { ...l, stage: targetStage } : l))
    );

    try {
      await fetch(`/api/crm/leads/${draggedLead.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
    } catch (error) {
      console.error("Failed to update lead stage:", error);
      // Revert on error
      fetchLeads();
    }

    setDraggedLead(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Pipeline</h1>
          <p className="text-sm text-grey mt-1">Drag and drop leads between stages</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/crm/leads" className="btn-secondary text-sm">
            List View
          </Link>
          <Link href="/crm/leads/new" className="btn-primary text-sm">
            + New Lead
          </Link>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.filter((s) => s.slug !== "lost").map((stage) => {
          const stageLeads = getLeadsForStage(stage.slug);
          
          return (
            <div
              key={stage.slug}
              className="flex-shrink-0 w-72"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.slug)}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <h3 className="text-sm font-semibold">{stage.name}</h3>
                  <span className="text-xs text-grey bg-surface-2 px-2 py-0.5 rounded-full">
                    {stageLeads.length}
                  </span>
                </div>
              </div>

              {/* Stage Column */}
              <div className="bg-surface-2 rounded-xl p-3 min-h-[500px] space-y-3">
                {stageLeads.length === 0 ? (
                  <div className="text-center py-8 text-grey text-sm">
                    No leads in this stage
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      className={`rounded-lg border border-border bg-surface p-4 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors ${
                        draggedLead?.id === lead.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                            {lead.fullName[0]}
                          </div>
                          <div>
                            <Link
                              href={`/crm/leads/${lead.id}`}
                              className="text-sm font-medium hover:text-primary transition-colors"
                            >
                              {lead.fullName}
                            </Link>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            lead.leadCategory === "hot"
                              ? "bg-red-500/20 text-red-400"
                              : lead.leadCategory === "warm"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-grey/20 text-grey"
                          }`}
                        >
                          {lead.leadScore}
                        </span>
                      </div>
                      
                      {lead.businessName && (
                        <p className="text-xs text-grey mb-2">{lead.businessName}</p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-grey">
                        <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
                        <Link
                          href={`/crm/leads/${lead.id}`}
                          className="text-primary hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

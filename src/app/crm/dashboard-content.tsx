"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  stats: {
    totalLeads: number;
    newLeadsToday: number;
    hotLeads: number;
    qualifiedLeads: number;
    activeClients: number;
    activeProjects: number;
    pendingTasks: number;
    meetingsToday: number;
    pendingProposals: number;
  };
  pipeline: Record<string, number>;
  recentLeads: Array<{
    id: number;
    fullName: string;
    email: string;
    businessName: string | null;
    leadScore: number;
    leadCategory: string | null;
    stage: string;
    createdAt: string;
  }>;
  upcomingMeetings: Array<{
    id: number;
    title: string;
    scheduledAt: string;
    type: string;
  }>;
  recentActivities: Array<{
    id: number;
    type: string;
    action: string;
    description: string | null;
    createdAt: string;
  }>;
}

const STAT_CARDS = [
  { key: "totalLeads", label: "Total Leads", icon: "👥", color: "primary" },
  { key: "newLeadsToday", label: "New Today", icon: "✨", color: "accent" },
  { key: "hotLeads", label: "Hot Leads", icon: "🔥", color: "red" },
  { key: "qualifiedLeads", label: "Qualified", icon: "✓", color: "green" },
  { key: "activeClients", label: "Active Clients", icon: "🏢", color: "blue" },
  { key: "activeProjects", label: "Active Projects", icon: "📁", color: "purple" },
  { key: "meetingsToday", label: "Meetings Today", icon: "📅", color: "yellow" },
  { key: "pendingTasks", label: "Pending Tasks", icon: "📋", color: "orange" },
];

const PIPELINE_STAGES = [
  { slug: "new", name: "New", color: "#6B7280" },
  { slug: "qualified", name: "Qualified", color: "#3B82F6" },
  { slug: "discovery_scheduled", name: "Discovery", color: "#8B5CF6" },
  { slug: "proposal_sent", name: "Proposal", color: "#F59E0B" },
  { slug: "won", name: "Won", color: "#10B981" },
];

export function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/crm/dashboard");
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const pipeline = data?.pipeline || {};

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-[var(--font-heading)]">Dashboard</h1>
          <p className="text-sm text-grey mt-1">Welcome back! Here&apos;s what&apos;s happening.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/crm/leads/new" className="btn-primary text-sm">
            + New Lead
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="rounded-xl border border-border bg-surface p-4 md:p-5 card-hover"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{card.icon}</span>
              <span className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">
                {(stats as Record<string, number>)[card.key] || 0}
              </span>
            </div>
            <p className="text-sm text-grey mt-2">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Pipeline Overview */}
      <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold font-[var(--font-heading)]">Pipeline Overview</h2>
          <Link href="/crm/pipeline" className="text-sm text-primary hover:underline">
            View Pipeline →
          </Link>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.slug} className="text-center">
              <div
                className="h-24 rounded-lg flex items-center justify-center text-2xl font-semibold"
                style={{ backgroundColor: `${stage.color}20` }}
              >
                {pipeline[stage.slug] || 0}
              </div>
              <p className="text-xs text-grey mt-2">{stage.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Recent Leads</h2>
            <Link href="/crm/leads" className="text-sm text-primary hover:underline">
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {data?.recentLeads && data.recentLeads.length > 0 ? (
              data.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/crm/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {lead.fullName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{lead.fullName}</p>
                      <p className="text-xs text-grey">{lead.businessName || lead.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      lead.leadCategory === "hot" ? "bg-red-500/20 text-red-400" :
                      lead.leadCategory === "warm" ? "bg-yellow-500/20 text-yellow-400" :
                      "bg-grey/20 text-grey"
                    }`}>
                      {lead.leadScore}/100
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-8 text-grey">
                <p className="text-sm">No leads yet</p>
                <Link href="/crm/leads/new" className="text-primary text-sm hover:underline mt-2 inline-block">
                  Create your first lead →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold font-[var(--font-heading)]">Upcoming Meetings</h2>
            <Link href="/crm/meetings" className="text-sm text-primary hover:underline">
              View All →
            </Link>
          </div>
          <div className="space-y-3">
            {data?.upcomingMeetings && data.upcomingMeetings.length > 0 ? (
              data.upcomingMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{meeting.title}</p>
                      <p className="text-xs text-grey">
                        {new Date(meeting.scheduledAt).toLocaleDateString()} at{" "}
                        {new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-grey capitalize">{meeting.type}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-grey">
                <p className="text-sm">No upcoming meetings</p>
                <Link href="/crm/meetings/new" className="text-primary text-sm hover:underline mt-2 inline-block">
                  Schedule a meeting →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-border bg-surface p-5 md:p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-5">Recent Activity</h2>
        <div className="space-y-4">
          {data?.recentActivities && data.recentActivities.length > 0 ? (
            data.recentActivities.slice(0, 5).map((activity) => (
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
            <p className="text-sm text-grey text-center py-4">No recent activity</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Add Lead", href: "/crm/leads/new", icon: "👤" },
          { label: "Schedule Meeting", href: "/crm/meetings/new", icon: "📅" },
          { label: "Create Task", href: "/crm/tasks/new", icon: "✓" },
          { label: "View Analytics", href: "/crm/analytics", icon: "📊" },
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:border-primary/30 hover:bg-primary/5 transition-colors"
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

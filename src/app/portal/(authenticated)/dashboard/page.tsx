"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/proposals/format";

export default function PortalDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/dashboard").then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-surface border border-border" />)}</div>;
  if (!data?.client) return <div className="text-center py-20 text-grey"><p className="text-4xl mb-4">👋</p><p className="text-lg">Welcome! Your client data will appear here.</p></div>;

  const { client, activeProject, projects, invoices, proposals, upcomingMeeting, unreadMessages, invoiceDue } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Welcome back, {client.primaryContactName?.split(" ")[0] || "Client"} 👋</h1>
        <p className="mt-2 text-grey">{client.companyName || "Your Portal"}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-2xl font-semibold font-[var(--font-heading)]">{projects.length}</p>
          <p className="text-xs text-grey mt-1">Active Projects</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-2xl font-semibold font-[var(--font-heading)]">{invoices.length}</p>
          <p className="text-xs text-grey mt-1">Invoices</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-2xl font-semibold font-[var(--font-heading)]">{unreadMessages}</p>
          <p className="text-xs text-grey mt-1">Unread Messages</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-2xl font-semibold font-[var(--font-heading)]">{proposals.length}</p>
          <p className="text-xs text-grey mt-1">Proposals</p>
        </div>
      </div>

      {/* Active project */}
      {activeProject && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Current Project</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold">{activeProject.name}</p>
              <p className="text-sm text-grey mt-1">{activeProject.description?.slice(0, 100)}</p>
              <div className="mt-3 flex items-center gap-4 text-sm text-grey-dark">
                <span>Status: <span className="text-white capitalize">{activeProject.status}</span></span>
                <span>Progress: <span className="text-white">{activeProject.progress || 0}%</span></span>
              </div>
              <div className="mt-3 w-full max-w-xs h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${activeProject.progress || 0}%` }} />
              </div>
            </div>
            <Link href={`/portal/projects/${activeProject.id}`} className="btn-primary text-sm shrink-0">View Project →</Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {invoiceDue.length > 0 && <Link href="/portal/invoices" className="rounded-xl border border-border bg-surface p-5 card-hover">
          <span className="text-2xl">💰</span>
          <p className="mt-2 text-sm font-medium text-white">Pay Invoices</p>
          <p className="text-xs text-grey">{invoiceDue.length} invoice{invoiceDue.length > 1 ? "s" : ""} due</p>
        </Link>}
        <Link href="/portal/files" className="rounded-xl border border-border bg-surface p-5 card-hover">
          <span className="text-2xl">📁</span>
          <p className="mt-2 text-sm font-medium text-white">Upload Files</p>
          <p className="text-xs text-grey">Share documents securely</p>
        </Link>
        <Link href="/portal/proposals" className="rounded-xl border border-border bg-surface p-5 card-hover">
          <span className="text-2xl">📄</span>
          <p className="mt-2 text-sm font-medium text-white">View Proposals</p>
          <p className="text-xs text-grey">{proposals.length} proposal{proposals.length !== 1 ? "s" : ""}</p>
        </Link>
        <Link href="/portal/messages" className="rounded-xl border border-border bg-surface p-5 card-hover">
          <span className="text-2xl">💬</span>
          <p className="mt-2 text-sm font-medium text-white">Contact Us</p>
          <p className="text-xs text-grey">Send a message</p>
        </Link>
      </div>

      {/* Recent proposals */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-border"><h2 className="text-lg font-semibold font-[var(--font-heading)]">Recent Proposals</h2></div>
          <div className="divide-y divide-border">
            {proposals.slice(0, 5).map((p: any) => (
              <Link key={p.id} href={`/proposal/${p.secureToken}`} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{p.title}</p>
                  <p className="text-xs text-grey-dark mt-0.5">{p.number} · {formatDate(p.createdAt)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize ${p.status === "accepted" ? "text-green-400 border-green-500/30 bg-green-500/10" : p.status === "sent" ? "text-blue-400 border-blue-500/30" : "text-grey border-border"}`}>{p.status}</span>
                  <span className="text-sm text-grey">{formatMoney(p.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatMoney, formatDate } from "@/lib/proposals/format";

export default function Client360Page({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [id, setId] = useState("");

  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { const r = await fetch(`/api/admin/clients/${id}/360`); const d = await r.json(); setData(d); } catch {} finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse h-96 rounded-xl bg-surface border border-border" />;
  if (!data?.client) return <div className="text-grey text-center py-16">Client not found.</div>;

  const { client, lead, proposals, invoices, projects, portalUsers, activity, timeline, meetings, supportTickets, workflows } = data;

  return (
    <div className="space-y-6 max-w-6xl">
      <div><Link href="/admin/portal/clients" className="text-xs text-grey hover:text-white">← Portal Clients</Link>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)] mt-1">Client 360: {client.companyName || client.primaryContactName}</h1>
        <p className="text-sm text-grey">{client.primaryContactEmail}{client.primaryContactPhone ? ` · ${client.primaryContactPhone}` : ""}</p>
      </div>

      {/* Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-grey-dark">CRM Stage</p><p className="text-lg font-semibold mt-1 capitalize">{lead?.stage || "—"}</p></div>
        <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-grey-dark">Proposals</p><p className="text-lg font-semibold mt-1">{proposals.length}</p></div>
        <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-grey-dark">Projects</p><p className="text-lg font-semibold mt-1">{projects.length}</p></div>
        <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-grey-dark">Portal Users</p><p className="text-lg font-semibold mt-1">{portalUsers.length}</p></div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-4">Activity Timeline</h2>
        {timeline.length === 0 ? <p className="text-sm text-grey-dark">No activity recorded.</p> : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {timeline.slice(0, 20).map((t: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                <div className="flex-1"><p className="text-grey">{t.action}</p><p className="text-xs text-grey-dark">{formatDate(t.date)}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proposals */}
      {proposals.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Proposals ({proposals.length})</h2>
          {proposals.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{p.title}</span>
              <div className="flex items-center gap-3"><span className="text-xs capitalize px-2 py-0.5 rounded-full border">{p.status}</span><span className="text-sm">{formatMoney(p.total)}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Invoices ({invoices.length})</h2>
          {invoices.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{i.number}</span>
              <div className="flex items-center gap-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${i.status === "paid" ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"}`}>{i.status}</span><span className="text-sm">{formatMoney(i.total)}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Projects ({projects.length})</h2>
          {projects.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{p.name}</span>
              <div className="flex items-center gap-3"><span className="text-xs capitalize px-2 py-0.5 rounded-full border">{p.status}</span><span className="text-xs text-grey-dark">{p.progress || 0}%</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Portal Users */}
      {portalUsers.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Portal Users ({portalUsers.length})</h2>
          {portalUsers.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{u.name} · {u.email}</span>
              <span className="text-xs">{u.role}{u.isActive ? "" : " (inactive)"}</span>
            </div>
          ))}
        </div>
      )}

      {/* Meetings */}
      {meetings.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Meetings ({meetings.length})</h2>
          {meetings.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{m.title}</span>
              <span className="text-xs text-grey-dark">{m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* Support Tickets */}
      {supportTickets.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Support Tickets ({supportTickets.length})</h2>
          {supportTickets.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{t.title}</span>
              <span className="text-xs capitalize px-2 py-0.5 rounded-full border">{t.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Workflows */}
      {workflows.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Workflows ({workflows.length})</h2>
          {workflows.map((w: any) => (
            <div key={w.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <span className="text-sm text-grey">{w.eventType}</span>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${w.status === "completed" ? "text-green-400 border-green-500/30" : w.status === "failed" ? "text-red-400 border-red-500/30" : "text-yellow-400 border-yellow-500/30"}`}>{w.status}</span>
                {w.lastError && <span className="text-xs text-red-400" title={w.lastError}>⚠️</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

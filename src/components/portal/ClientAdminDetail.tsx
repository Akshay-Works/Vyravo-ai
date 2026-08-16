"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/proposals/format";

export function ClientAdminDetail({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const r = await fetch(`/api/portal/admin/clients/${id}`); const d = await r.json(); setData(d); } catch {} finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse h-64 rounded-xl bg-surface border border-border" />;
  if (!data?.client) return <div className="text-grey text-center py-16">Client not found.</div>;

  const { client, projects, invoices, proposals, users, files } = data;

  return (
    <div className="space-y-6">
      <div><Link href="/admin/portal/clients" className="text-xs text-grey hover:text-white">← Portal Clients</Link>
        <h1 className="text-3xl font-semibold font-[var(--font-heading)] mt-1">{client.company_name || client.primary_contact_name}</h1>
        <p className="text-sm text-grey">{client.primary_contact_email}{client.primary_contact_phone ? ` · ${client.primary_contact_phone}` : ""}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-2xl font-semibold">{projects.length}</p><p className="text-xs text-grey">Projects</p></div>
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-2xl font-semibold">{invoices.length}</p><p className="text-xs text-grey">Invoices</p></div>
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-2xl font-semibold">{proposals.length}</p><p className="text-xs text-grey">Proposals</p></div>
        <div className="rounded-xl border border-border bg-surface p-5"><p className="text-2xl font-semibold">{users.length}</p><p className="text-xs text-grey">Portal Users</p></div>
      </div>

      {proposals.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Proposals</h2>
          <div className="space-y-2">
            {proposals.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm text-grey">{p.title}</span>
                <div className="flex items-center gap-3"><span className="text-xs capitalize px-2 py-0.5 rounded-full border">{p.status}</span><span className="text-sm">{formatMoney(p.total)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {users.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Portal Users</h2>
          <div className="space-y-2">
            {users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-grey">{u.name} · {u.email}</span>
                <span className="text-xs capitalize px-2 py-0.5 rounded-full border">{u.role}{u.is_active ? "" : " (inactive)"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

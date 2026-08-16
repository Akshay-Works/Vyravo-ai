"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ClientAdminList() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/admin/clients").then((r) => r.json()).then((d) => setClients(d.clients || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]">Portal <span className="gradient-text">Clients</span></h1>
      {clients.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-grey">No clients yet.</p></div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-grey-dark border-b border-border">
              <th className="px-6 py-4 font-medium">Company</th><th className="px-6 py-4 font-medium">Contact</th><th className="px-6 py-4 font-medium">Status</th><th className="px-6 py-4 font-medium">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {clients.map((c: any) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 text-grey">{c.company_name || "—"}</td>
                  <td className="px-6 py-4 text-grey">{c.primary_contact_name}<br /><span className="text-xs text-grey-dark">{c.primary_contact_email}</span></td>
                  <td className="px-6 py-4"><span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize ${c.status === "active" ? "text-green-400 border-green-500/30 bg-green-500/10" : "text-grey border-border"}`}>{c.status}</span></td>
                  <td className="px-6 py-4"><Link href={`/admin/portal/clients/${c.id}`} className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

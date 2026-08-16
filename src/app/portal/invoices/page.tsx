"use client";

import { useEffect, useState } from "react";
import { formatMoney, formatDate } from "@/lib/proposals/format";

export default function PortalInvoicesPage() {
  const [invoices, setInvs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/invoices").then((r) => r.json()).then((d) => setInvs(d.invoices || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Invoices</span></h1>
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">💰</p><p className="text-grey">No invoices yet.</p></div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-grey-dark border-b border-border">
              <th className="px-6 py-4 font-medium">Invoice</th><th className="px-6 py-4 font-medium">Date</th><th className="px-6 py-4 font-medium">Due</th><th className="px-6 py-4 font-medium text-right">Amount</th><th className="px-6 py-4 font-medium">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 text-grey">{inv.number || `#${inv.id}`}</td>
                  <td className="px-6 py-4 text-grey-dark">{formatDate(inv.createdAt)}</td>
                  <td className="px-6 py-4 text-grey-dark">{formatDate(inv.dueDate)}</td>
                  <td className="px-6 py-4 text-right text-grey font-medium">{formatMoney(inv.total)}</td>
                  <td className="px-6 py-4"><span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize ${inv.status === "paid" ? "text-green-400 border-green-500/30 bg-green-500/10" : inv.status === "overdue" ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"}`}>{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProposalStatusBadge } from "./StatusBadge";
import { formatMoney, formatDate, timeAgo } from "@/lib/proposals/format";

interface Row {
  id: number;
  title: string;
  number: string | null;
  status: string;
  clientName: string | null;
  companyName: string | null;
  clientEmail: string | null;
  industry: string | null;
  total: string | null;
  currency: string | null;
  generatedByAi: boolean | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  lastActivityAt: string | null;
  totalViewed: number | null;
  createdAt: string;
  updatedAt: string;
}

export function ProposalList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [debounced, setDebounced] = useState({ search: "", status: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ search, status }), 400);
    return () => clearTimeout(t);
  }, [search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (debounced.search) params.set("search", debounced.search);
      if (debounced.status) params.set("status", debounced.status);
      const res = await fetch(`/api/proposals?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setRows(json.proposals || []);
      setTotal(json.total || 0);
    } catch (e: any) {
      setError(String(e?.message || "Failed to load proposals"));
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: number, action: string) => {
    if (action === "delete" && !confirm("Delete this proposal permanently? This cannot be undone.")) return;
    try {
      let res: Response;
      if (action === "delete") res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
      else if (action === "duplicate") res = await fetch(`/api/proposals/${id}/duplicate`, { method: "POST" });
      else if (action === "send") res = await fetch(`/api/proposals/${id}/send`, { method: "POST" });
      else if (action === "archive") res = await fetch(`/api/proposals/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "archived" }),
      });
      else if (action === "approve") res = await fetch(`/api/proposals/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }),
      });
      else return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || `Action failed: ${action}`);
        return;
      }
      load();
      router.refresh();
    } catch (e: any) {
      alert(`Action failed: ${e?.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-heading)]">
            Proposal <span className="gradient-text">Management</span>
          </h1>
          <p className="mt-2 text-sm text-grey">{total} proposals</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/proposals/new" className="btn-primary text-sm">＋ New Proposal</Link>
          <Link href="/admin/proposals/templates" className="btn-secondary text-sm">📋 Templates</Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, company, title…"
          className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg border border-border text-sm text-grey focus:outline-none focus:border-primary/50"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="viewed">Viewed</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="changes_requested">Changes Requested</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse h-16 rounded-xl bg-surface border border-border" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-4xl mb-4">📄</p>
          <h3 className="text-lg font-semibold font-[var(--font-heading)]">No proposals yet</h3>
          <p className="mt-2 text-sm text-grey">Create your first proposal manually or generate one with AI.</p>
          <Link href="/admin/proposals/new" className="btn-primary text-sm mt-6 inline-flex">＋ New Proposal</Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-grey-dark border-b border-border">
                  <th className="px-4 py-3 font-medium">Proposal</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/proposals/${p.id}`} className="font-medium text-white hover:text-primary transition-colors">
                        {p.title}
                        {p.generatedByAi && <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">AI</span>}
                      </Link>
                      <p className="text-xs text-grey-dark">{p.number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-grey">{p.clientName || "—"}</p>
                      <p className="text-xs text-grey-dark">{p.companyName || ""}</p>
                    </td>
                    <td className="px-4 py-3"><ProposalStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-right text-grey font-medium">{formatMoney(p.total, p.currency || "USD")}</td>
                    <td className="px-4 py-3 text-grey-dark">{formatDate(p.sentAt)}</td>
                    <td className="px-4 py-3 text-grey-dark">{formatDate(p.expiresAt)}</td>
                    <td className="px-4 py-3 text-grey-dark">{timeAgo(p.lastActivityAt || p.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Link href={`/admin/proposals/${p.id}`} className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-white transition-colors">View</Link>
                        <Link href={`/admin/proposals/${p.id}/edit`} className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-white transition-colors">Edit</Link>
                        {p.status === "draft" || p.status === "in_review" ? (
                          <button onClick={() => handleAction(p.id, "approve")} className="text-xs px-2 py-1 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors">Approve</button>
                        ) : null}
                        {["draft", "approved"].includes(p.status) && p.clientEmail ? (
                          <button onClick={() => handleAction(p.id, "send")} className="text-xs px-2 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">Send</button>
                        ) : null}
                        <button onClick={() => handleAction(p.id, "duplicate")} className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-white transition-colors">Copy</button>
                        <a href={`/api/proposals/${p.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-white transition-colors">PDF</a>
                        {p.status !== "archived" ? (
                          <button onClick={() => handleAction(p.id, "archive")} className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-orange-400 transition-colors">Archive</button>
                        ) : null}
                        <button onClick={() => handleAction(p.id, "delete")} className="text-xs px-2 py-1 rounded-lg border border-border text-grey hover:text-red-400 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

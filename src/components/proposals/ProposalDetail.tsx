"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProposalStatusBadge } from "@/components/proposals/StatusBadge";
import { formatMoney, formatDate, formatDateTime } from "@/lib/proposals/format";

interface DetailData {
  proposal: any;
  versions: any[];
  items: any[];
  events: any[];
  comments: any[];
  milestones: any[];
  acceptance: any[];
}

const STATUS_ACTIONS: { status: string; label: string; cls: string }[] = [
  { status: "in_review", label: "→ In Review", cls: "border-purple-500/30 text-purple-400" },
  { status: "approved", label: "✓ Approve", cls: "border-blue-500/30 text-blue-400" },
  { status: "sent", label: "📨 Send", cls: "border-primary/30 text-primary" },
  { status: "accepted", label: "✅ Accept", cls: "border-green-500/30 text-green-400" },
  { status: "rejected", label: "❌ Reject", cls: "border-red-500/30 text-red-400" },
  { status: "archived", label: "🗄 Archive", cls: "border-border text-grey" },
];

export function ProposalDetail({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [secureLink, setSecureLink] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (data?.proposal.secureToken) {
      setSecureLink(`${window.location.origin}/proposal/${data.proposal.secureToken}`);
    }
  }, [data]);

  const act = async (status: string) => {
    const res = await fetch(`/api/proposals/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Failed"); }
    load(); router.refresh();
  };

  const send = async () => {
    const res = await fetch(`/api/proposals/${id}/send`, { method: "POST" });
    const j = await res.json();
    if (!res.ok) { alert(j.error || "Send failed"); return; }
    load(); router.refresh();
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await fetch(`/api/proposals/${id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: comment }),
    });
    setComment("");
    load();
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(secureLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  if (loading) return <div className="animate-pulse h-96 rounded-xl bg-surface border border-border" />;
  if (!data) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-400 text-sm">Failed to load proposal.</div>;

  const { proposal: p, events, comments, versions, milestones, acceptance, items } = data;
  const content = p.proposalContent || { sections: [], services: [], pricing: {}, milestones: [] };
  const ordered = [...(content.sections || [])].sort((a: any, b: any) => {
    const order = ["cover", "executive_summary", "understanding", "challenges", "goals", "solution", "recommended_systems", "scope", "deliverables", "implementation", "timeline", "investment", "addons", "support", "why_vyravo", "case_studies", "terms", "acceptance", "contact"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  const canSend = ["draft", "approved"].includes(p.status) && p.clientEmail && (!p.generatedByAi || p.status === "approved");
  const isTerminal = ["accepted", "rejected", "expired", "archived"].includes(p.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/proposals" className="text-xs text-grey hover:text-white">← Proposals</Link>
            <span className="text-grey-dark">/</span>
            <Link href={`/admin/proposals/${id}/edit`} className="text-xs text-grey hover:text-white">Edit</Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold font-[var(--font-heading)]">{p.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ProposalStatusBadge status={p.status} />
            <span className="text-xs text-grey-dark">{p.number}</span>
            {p.generatedByAi && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">AI Generated</span>}
            <span className="text-xs text-grey-dark">Total: <span className="text-white font-medium">{formatMoney(p.total, p.currency)}</span></span>
            {p.acceptedAt && <span className="text-xs text-green-400">Accepted {formatDateTime(p.acceptedAt)}</span>}
          </div>
          <div className="mt-2 text-xs text-grey-dark flex flex-wrap gap-x-4 gap-y-1">
            <span>{p.clientName || "—"}{p.companyName ? ` · ${p.companyName}` : ""}</span>
            <span>{p.industry || ""}</span>
            {p.clientEmail && <span>{p.clientEmail}</span>}
            <span>Expires {formatDate(p.expiresAt)}</span>
            <span>Views: {p.totalViewed || 0}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href={`/admin/proposals/${id}/edit`} className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors">✏️ Edit</Link>
          {canSend ? (
            <button onClick={send} className="btn-primary text-sm">📨 Send Proposal</button>
          ) : !p.clientEmail ? (
            <span className="text-xs text-grey-dark self-center">Add client email to send</span>
          ) : null}
          {!isTerminal && (
            <>
              {STATUS_ACTIONS.filter((a) => a.status !== "sent" && a.status !== p.status).map((a) => (
                <button key={a.status} onClick={() => act(a.status)} className={`text-sm px-3 py-2 rounded-lg border transition-colors ${a.cls}`}>
                  {a.label}
                </button>
              ))}
            </>
          )}
          <a href={`/api/proposals/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors">📄 Download PDF</a>
        </div>
      </div>

      {/* Secure link */}
      {secureLink && (
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-grey-dark mb-1">Secure client link (no login required)</p>
            <p className="text-sm text-primary truncate">{secureLink}</p>
          </div>
          <button onClick={copyLink} className="text-xs px-3 py-2 rounded-lg border border-border text-grey hover:text-white transition-colors">
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <a href={secureLink} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors">
            Open as client →
          </a>
        </div>
      )}

      {/* Content preview */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold font-[var(--font-heading)]">Proposal Preview</h2>
          <span className="text-xs text-grey-dark">{items.length} line items · {milestones.length} milestones</span>
        </div>
        <div className="p-6 md:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          {ordered.filter((s: any) => !["cover", "contact"].includes(s.id)).map((s: any) => (
            <div key={s.id}>
              <h3 className="text-base font-semibold font-[var(--font-heading)] mb-1.5">{s.title}</h3>
              {s.type === "list" ? (
                <ul className="text-sm text-grey space-y-1">
                  {(s.items || []).map((it: string, x: number) => <li key={x}>• {it}</li>)}
                </ul>
              ) : s.id === "investment" || s.type === "pricing" ? (
                <p className="text-sm text-grey">See investment summary below ({formatMoney(p.total, p.currency)})</p>
              ) : (
                <p className="text-sm text-grey whitespace-pre-wrap">{s.content || "—"}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Milestones + investment */}
      {(milestones.length > 0 || items.length > 0) && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Investment</h2>
            <div className="space-y-2 text-sm">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span className="text-grey">{it.name}</span>
                  <span>{formatMoney(it.implementationFee, p.currency)}{Number(it.monthlyRecurring) > 0 && ` + ${formatMoney(it.monthlyRecurring, p.currency)}/mo`}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold border-t border-border pt-2"><span>Total</span><span>{formatMoney(p.total, p.currency)}</span></div>
              {Number(p.discount) > 0 && <div className="flex justify-between text-xs text-grey"><span>Discount</span><span>−{formatMoney(p.discount, p.currency)}</span></div>}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Payment Milestones</h2>
            {milestones.length === 0 ? <p className="text-sm text-grey-dark">No milestones set.</p> : (
              <ul className="space-y-2 text-sm">
                {milestones.map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span className="text-grey">{m.label}</span>
                    <span>{m.percent}% · {formatMoney(m.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Comments & Change Requests</h2>
        <div className="flex gap-2 mb-4">
          <input value={comment} onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addComment()}
            placeholder="Add a team note…"
            className="flex-1 px-3 py-2.5 rounded-lg bg-bg border border-border text-sm text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
          <button onClick={addComment} className="btn-primary text-sm">Add</button>
        </div>
        {comments.length === 0 ? <p className="text-sm text-grey-dark">No comments yet.</p> : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-bg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">{c.author || "Anonymous"}</span>
                  <span className="text-xs text-grey-dark">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-grey">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Acceptance records */}
      {acceptance.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Client Decisions</h2>
          <ul className="space-y-3">
            {acceptance.map((a) => (
              <li key={a.id} className="rounded-lg bg-bg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${a.decision === "accepted" ? "text-green-400" : a.decision === "rejected" ? "text-red-400" : "text-orange-400"}`}>
                    {a.decision.replace("_", " ").toUpperCase()}
                  </span>
                  <span className="text-xs text-grey-dark">{formatDateTime(a.signedAt)}</span>
                </div>
                <p className="mt-1 text-sm text-grey">{a.clientName}{a.clientEmail ? ` · ${a.clientEmail}` : ""}</p>
                {a.comments && <p className="mt-1 text-sm text-grey whitespace-pre-wrap">“{a.comments}”</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Activity</h2>
        {events.length === 0 ? <p className="text-sm text-grey-dark">No activity yet.</p> : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-grey capitalize">{e.eventType.replace(/_/g, " ")}</span>
                <span className="text-xs text-grey-dark">{formatDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Versions */}
      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">Version History</h2>
        {versions.length === 0 ? <p className="text-sm text-grey-dark">No versions.</p> : (
          <ul className="space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between">
                <span className="text-grey">v{v.version} — {v.changeNote || v.title}</span>
                <span className="text-xs text-grey-dark">{formatDateTime(v.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

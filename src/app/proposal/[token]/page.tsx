"use client";

import { useEffect, useState, useCallback } from "react";
import { formatMoney, formatDate } from "@/lib/proposals/format";

interface ProposalView {
  id: number;
  title: string;
  number: string | null;
  status: string;
  clientName: string | null;
  companyName: string | null;
  industry: string | null;
  currency: string | null;
  total: string | null;
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  expiresAt: string | null;
  signedBy: string | null;
  signedAt: string | null;
  content: any;
}

type Mode = "view" | "accept" | "reject" | "changes";

export default function ClientProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("view");
  const [form, setForm] = useState({ name: "", email: "", comments: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState("");

  // Resolve token
  const [tokenVal, setTokenVal] = useState("");
  useEffect(() => { params.then((p) => setTokenVal(p.token)); }, [params]);

  // Track view
  useEffect(() => {
    if (!tokenVal) return;
    fetch(`/api/proposal/${tokenVal}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setError(j.error); setProposal(null); }
        else setProposal(j.proposal);
      })
      .catch(() => setError("Failed to load proposal."))
      .finally(() => setLoading(false));
    // heartbeat tracking
    const t = setInterval(() => {
      fetch(`/api/proposal/${tokenVal}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "viewed" }),
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [tokenVal]);

  const submit = async () => {
    if (!form.name.trim() && mode !== "reject") { setError("Please enter your name."); return; }
    if (mode === "changes" && !form.comments.trim()) { setError("Please describe the changes you'd like."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/proposal/${tokenVal}/${mode === "view" ? "accept" : mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, email: form.email,
          comments: form.comments, reason: form.comments,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || "Something went wrong."); setSubmitting(false); return; }
      setDone(mode === "accept" ? "Thank you — your acceptance has been recorded. We'll be in touch shortly." : mode === "reject" ? "Thank you for letting us know. Your feedback has been recorded." : "Thank you — your change request has been sent to the Vyravo AI team.");
      setMode("view");
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  };

  const ordered = (proposal?.content?.sections || []).slice().sort((a: any, b: any) => {
    const order = ["cover", "executive_summary", "understanding", "challenges", "goals", "solution", "recommended_systems", "scope", "deliverables", "implementation", "timeline", "investment", "addons", "support", "why_vyravo", "case_studies", "terms", "acceptance", "contact"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent mx-auto animate-pulse" />
          <p className="mt-4 text-sm text-grey">Loading proposal…</p>
        </div>
      </main>
    );
  }

  if (error && !proposal) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-xl font-semibold font-[var(--font-heading)]">Proposal Unavailable</h1>
          <p className="mt-3 text-sm text-grey">{error}</p>
        </div>
      </main>
    );
  }

  const p = proposal!;
  const isTerminal = ["accepted", "rejected", "expired", "archived"].includes(p.status);
  const content = p.content || { sections: [], services: [], pricing: {}, milestones: [] };

  return (
    <main className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.15em] text-primary">VYRAVO AI</span>
          {p.number && <span className="text-xs text-grey-dark">{p.number}</span>}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {done && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-sm text-green-300 mb-6">{done}</div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 mb-6">{error}</div>
        )}

        {/* Cover */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden mb-6">
          <div className="px-6 py-12 text-center bg-gradient-to-br from-primary/10 to-accent/5 border-b border-border">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary">VYRAVO AI</p>
            <h1 className="mt-3 text-2xl md:text-3xl font-semibold font-[var(--font-heading)] leading-tight">{p.title}</h1>
            <p className="mt-2 text-sm text-grey">Intelligent Automation for Modern Businesses</p>
            <p className="mt-6 text-sm font-medium text-primary">Prepared for {p.clientName || "[Client Name]"}{p.companyName ? ` · ${p.companyName}` : ""}</p>
            <p className="mt-1 text-xs text-grey-dark">Proposal expires {formatDate(p.expiresAt)}</p>
          </div>

          {/* Status banner */}
          {isTerminal && (
            <div className={`px-6 py-4 text-center text-sm font-medium ${p.status === "accepted" ? "bg-green-500/10 text-green-300 border-t border-green-500/20" : "bg-orange-500/10 text-orange-300 border-t border-orange-500/20"}`}>
              {p.status === "accepted" && p.signedBy ? `Accepted by ${p.signedBy} on ${formatDate(p.signedAt)}` : `Status: ${p.status.replace("_", " ")}`}
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {ordered.filter((s: any) => !["cover", "contact", "acceptance"].includes(s.id)).map((s: any) => (
            <section key={s.id}>
              {s.id === "investment" || s.type === "pricing" ? (
                <>
                  <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-3">{s.title}</h2>
                  <div className="rounded-xl border border-border bg-surface p-5 space-y-2 text-sm">
                    {(content.services || []).filter((x: any) => x.implementationFee).map((x: any) => (
                      <div key={x.id} className="flex justify-between gap-3">
                        <span className="text-grey">{x.name}</span>
                        <span className="shrink-0">{formatMoney(x.implementationFee, content.pricing?.currency)}</span>
                      </div>
                    ))}
                    {(content.pricing?.addons || []).map((a: any, i: number) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="text-grey">Add-on: {a.name}</span>
                        <span className="shrink-0">{formatMoney(a.price, content.pricing?.currency)}</span>
                      </div>
                    ))}
                    {Number(p.discount) > 0 && <div className="flex justify-between"><span className="text-grey">Discount</span><span>−{formatMoney(p.discount, p.currency)}</span></div>}
                    {Number(p.tax) > 0 && <div className="flex justify-between"><span className="text-grey">Tax</span><span>{formatMoney(p.tax, p.currency)}</span></div>}
                    <div className="flex justify-between font-semibold border-t border-border pt-2">
                      <span>Total Investment</span>
                      <span>{formatMoney(p.total, p.currency)}</span>
                    </div>
                    {Number(content.pricing?.monthlyRetainer) > 0 && (
                      <div className="flex justify-between text-xs text-grey"><span>Ongoing support</span><span>{formatMoney(content.pricing.monthlyRetainer, content.pricing?.currency)}/month</span></div>
                    )}
                    {(content.milestones || []).length > 0 && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-grey-dark mb-1.5">Payment schedule:</p>
                        {(content.milestones || []).map((m: any) => (
                          <p key={m.id} className="text-xs text-grey py-0.5">· {m.label} — {m.percent}% · {formatMoney(m.amount, content.pricing?.currency)}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-2">{s.title}</h2>
                  {s.type === "list" ? (
                    <ul className="space-y-1.5 text-sm text-grey">
                      {(s.items || []).map((it: string, x: number) => <li key={x} className="flex gap-2"><span>•</span><span>{it}</span></li>)}
                    </ul>
                  ) : (
                    <div className="text-sm text-grey leading-relaxed whitespace-pre-wrap">{s.content}</div>
                  )}
                </>
              )}
            </section>
          ))}
        </div>

        {/* Contact */}
        <section className="mt-10 rounded-xl border border-border bg-surface p-6 text-sm">
          <h2 className="text-lg font-semibold font-[var(--font-heading)] mb-2">Contact</h2>
          <p className="text-grey">Vyravo AI — Intelligent Automation for Modern Businesses</p>
          <p className="mt-1 text-grey">Phone: +91 9075707650</p>
          <p className="text-grey">Email: akshay.navale.work@gmail.com</p>
          <p className="text-grey">LinkedIn: linkedin.com/in/akshay-n-2692851b7</p>
        </section>

        {/* Sticky action bar */}
        {!isTerminal && (
          <div className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border">
            <div className="max-w-3xl mx-auto px-4 py-3">
              {mode === "view" ? (
                <div className="flex gap-2">
                  <button onClick={() => setMode("accept")} className="btn-primary flex-1 justify-center">✓ Accept Proposal</button>
                  <button onClick={() => setMode("changes")} className="text-sm px-4 py-2.5 rounded-lg border border-border text-grey hover:text-white transition-colors">Request Changes</button>
                  <button onClick={() => setMode("reject")} className="text-sm px-4 py-2.5 rounded-lg border border-border text-grey hover:text-red-400 transition-colors">Decline</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {mode !== "reject" && (
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your full name" className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
                  )}
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Email (optional)" type="email" className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
                  <textarea value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
                    placeholder={mode === "changes" ? "Describe the changes you'd like…" : mode === "reject" ? "Reason (optional)…" : "Comments (optional)…"}
                    rows={2} className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50 resize-y" />
                  <div className="flex gap-2">
                    <button onClick={submit} disabled={submitting} className="btn-primary flex-1 justify-center disabled:opacity-50">
                      {submitting ? "Submitting…" : mode === "accept" ? "Confirm Acceptance" : mode === "reject" ? "Confirm Decline" : "Send Request"}
                    </button>
                    <button onClick={() => setMode("view")} className="text-sm px-4 py-2.5 rounded-lg border border-border text-grey hover:text-white transition-colors">Cancel</button>
                  </div>
                  {mode === "accept" && (
                    <p className="text-[11px] text-grey-dark text-center">By accepting, you agree to the scope, investment, and terms in this proposal. This records your acceptance as an electronic signature.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";

export default function PortalTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => { const r = await fetch("/api/portal/tickets"); const d = await r.json(); setTickets(d.tickets || []); setLoading(false); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    await fetch("/api/portal/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: desc }) });
    setTitle(""); setDesc(""); setShowForm(false); load();
  };

  if (loading) return <div className="animate-pulse h-40 rounded-xl bg-surface border border-border" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold font-[var(--font-heading)]"><span className="gradient-text">Support</span></h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? "Cancel" : "＋ New Request"}</button>
      </div>
      {showForm && (
        <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Subject" className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="Describe your request…" className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-white placeholder:text-grey-dark focus:outline-none focus:border-primary/50 resize-y" />
          <button onClick={create} disabled={!title.trim()} className="btn-primary disabled:opacity-50">Submit Request</button>
        </div>
      )}
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center"><p className="text-4xl mb-4">🎫</p><p className="text-grey">No support requests yet.</p></div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t: any) => (
            <div key={t.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-white">{t.title}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border capitalize ${t.status === "open" ? "text-yellow-400 border-yellow-500/30" : t.status === "resolved" || t.status === "closed" ? "text-green-400 border-green-500/30" : "text-blue-400 border-blue-500/30"}`}>{t.status}</span>
              </div>
              <p className="text-sm text-grey mt-2">{t.description}</p>
              <p className="text-xs text-grey-dark mt-2">Priority: {t.priority} · {new Date(t.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

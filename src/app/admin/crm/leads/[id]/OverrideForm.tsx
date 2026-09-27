"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  "new", "researched", "contacted", "replied", "replied_to", "qualified",
  "meeting_booked", "discovery_completed", "proposal_sent", "negotiation",
  "verbal_agreement", "invoice_sent", "payment_pending", "won", "onboarding",
  "active_client", "not_interested", "unqualified", "wrong_contact",
  "unsubscribed", "lost", "no_response", "nurture",
];

export function OverrideForm({ leadId, current }: { leadId: number; current: string }) {
  const [to, setTo] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const submit = async () => {
    if (to === current || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/sales/override", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, to, reason: "manual override from lead detail" }),
      });
      const j = await r.json();
      if (j.ok) { setMsg(`Moved → ${j.label || to}`); router.refresh(); }
      else setMsg(j.error || "failed");
    } catch (e: any) {
      setMsg(String(e?.message || e));
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center gap-2">
      <select value={to} onChange={(e) => setTo(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-white">
        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={submit} disabled={busy || to === current}
        className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40">
        {busy ? "…" : "Move"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </div>
  );
}

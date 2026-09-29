"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(path: string, method = "GET", body?: any) {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export function SearchBox() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const go = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) { setRes([]); setOpen(false); return; }
    const j = await api(`/api/admin/crm/search?q=${encodeURIComponent(v)}`);
    setRes(j.results || []);
    setOpen(true);
  };
  return (
    <div className="relative">
      <input value={q} onChange={(e) => go(e.target.value)} placeholder="Search contacts, companies, projects…"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-grey-dark" />
      {open && (
        <div className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
          {res.length === 0 && <div className="p-3 text-xs text-grey">No matches.</div>}
          {res.map((r: any, i: number) => (
            <a key={i} href={r.href} className="block rounded-md p-2 hover:bg-white/5">
              <div className="text-sm font-medium text-white">{r.title}</div>
              <div className="text-xs text-grey">{r.subtitle}</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {r.relationships.map((rel: string, j: number) => (
                  <span key={j} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-grey">{rel}</span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddClientForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setMsg("…");
    const j = await api("/api/admin/brandnest/clients", "POST", f);
    if (j.ok) { setMsg(j.created ? `Created → lead #${j.leadId}` : `Linked to existing contact #${j.leadId} (no duplicate)`); setF({ name: "", company: "", email: "", phone: "", notes: "" }); router.refresh(); }
    else setMsg(j.error || "failed");
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.name} onChange={set("name")} placeholder="Client name" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <input value={f.company} onChange={set("company")} placeholder="Company" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <input value={f.email} onChange={set("email")} placeholder="Email" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <input value={f.phone} onChange={set("phone")} placeholder="Phone" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
      </div>
      <input value={f.notes} onChange={set("notes")} placeholder="Notes (past work, context…)" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
      <div className="flex items-center gap-2">
        <button onClick={submit} className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Add BrandNest client</button>
        {msg && <span className="text-xs text-grey">{msg}</span>}
      </div>
      <p className="text-[11px] text-grey-dark">Deduped by email/phone — existing contacts are linked, never duplicated. Nothing is queued or sent.</p>
    </div>
  );
}

export function ScoreAllButton() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const j = await api("/api/admin/brandnest/reactivate", "POST", { action: "score_all" });
    setMsg(j.ok ? `Scored ${j.scored} clients → ${j.ready} ready for reactivation.` : (j.error || "failed"));
    setBusy(false);
    router.refresh();
  };
  return (
    <span className="flex items-center gap-2">
      <button onClick={go} disabled={busy} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-grey hover:text-white disabled:opacity-40">
        {busy ? "Scoring…" : "⚡ Score all for reactivation"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </span>
  );
}

export function DraftReactivationButton({ leadId }: { leadId: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    const j = await api("/api/admin/brandnest/reactivate", "POST", { leadId, action: "draft" });
    setMsg(j.ok ? `Draft #${j.id} held in Sales → Outbox for your approval.` : (j.skipped ? `Skipped: ${j.skipped}` : (j.error || "failed")));
    setBusy(false);
    if (j.ok) router.refresh();
  };
  return (
    <span className="flex items-center gap-2">
      <button onClick={go} disabled={busy} className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary disabled:opacity-40">
        {busy ? "…" : "✉️ Draft reactivation email"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </span>
  );
}

export function ConvertAndDraftButton({ leadId, already }: { leadId: number; already: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (already) return null;
  const go = async () => {
    if (busy || !confirm("Convert to Vyravo opportunity AND draft a proposal? No outreach will be queued; the proposal lands as a draft for approval.")) return;
    setBusy(true);
    const j = await api("/api/admin/brandnest/convert", "POST", { leadId, draftProposal: true });
    setMsg(j.ok ? `Converted${j.proposalId ? ` + proposal #${j.proposalId} drafted` : ""}.` : (j.error || "failed"));
    setBusy(false);
    if (j.ok) router.refresh();
  };
  return (
    <span className="flex items-center gap-2">
      <button onClick={go} disabled={busy} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-400 disabled:opacity-40">
        {busy ? "…" : "🌉 Convert + draft proposal"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </span>
  );
}

export function ConvertButton({ leadId, already }: { leadId: number; already: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (already) return <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-400">Vyravo opportunity active</span>;
  const go = async () => {
    if (busy || !confirm("Create a Vyravo opportunity for this contact? No outreach will be queued.")) return;
    setBusy(true);
    const j = await api("/api/admin/brandnest/convert", "POST", { leadId });
    setMsg(j.ok ? "Converted — BrandNest history preserved, no outreach queued." : (j.error || "failed"));
    setBusy(false);
    if (j.ok) router.refresh();
  };
  return (
    <span className="flex items-center gap-2">
      <button onClick={go} disabled={busy} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-400 disabled:opacity-40">
        {busy ? "…" : "Create Vyravo Opportunity"}
      </button>
      {msg && <span className="text-xs text-grey">{msg}</span>}
    </span>
  );
}

export function ReactivateControls({ leadId, current }: { leadId: number; current: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [suggest, setSuggest] = useState("");
  const load = async () => {
    const j = await api(`/api/admin/brandnest/reactivate?leadId=${leadId}`);
    if (j.ok) setSuggest(`Suggested: ${j.suggestion} — ${(j.reasons || []).join("; ")}`);
  };
  const setStatus = async (status: string) => {
    const j = await api("/api/admin/brandnest/reactivate", "POST", { leadId, action: "set", status });
    setMsg(j.ok ? `→ ${status} (nothing auto-sent)` : (j.error || "failed"));
    if (j.ok) router.refresh();
  };
  const task = async () => {
    const j = await api("/api/admin/brandnest/reactivate", "POST", { leadId, action: "task" });
    setMsg(j.ok ? `Follow-up task #${j.id} created for founder.` : (j.error || "failed"));
    if (j.ok) router.refresh();
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-grey">Reactivation: <b className="text-white">{current}</b></span>
        {["do_not_contact", "manual_review", "ready"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-grey hover:text-white">{s}</button>
        ))}
        <button onClick={task} className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">+ Follow-up task</button>
        <button onClick={load} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] text-grey hover:text-white">Suggest</button>
      </div>
      {(suggest || msg) && <p className="text-xs text-grey">{suggest || msg}</p>}
    </div>
  );
}

export function AddProjectForm({ leadId }: { leadId: number }) {
  const router = useRouter();
  const [f, setF] = useState({ service: "", amount: "", status: "pending", paymentMethod: "", notes: "" });
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const j = await api("/api/admin/brandnest/projects", "POST", { leadId, service: f.service, amount: Number(f.amount), status: f.status, paymentMethod: f.paymentMethod, notes: f.notes });
    if (j.ok) { setMsg(`Project #${j.id} recorded.`); setF({ service: "", amount: "", status: "pending", paymentMethod: "", notes: "" }); router.refresh(); }
    else setMsg(j.error || "failed");
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={f.service} onChange={set("service")} placeholder="Service / project" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <input value={f.amount} onChange={set("amount")} placeholder="Amount (₹)" type="number" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <select value={f.status} onChange={set("status")} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white">
          {["pending", "partially_paid", "paid", "refunded", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={f.paymentMethod} onChange={set("paymentMethod")} placeholder="Payment method" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <input value={f.notes} onChange={set("notes")} placeholder="Notes" className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Record project</button>
        {msg && <span className="text-xs text-grey">{msg}</span>}
      </div>
    </div>
  );
}

export function EditClientForm({ leadId, init }: { leadId: number; init: any }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: init.full_name || "", company: init.business_name || "", email: init.email || "",
    phone: init.phone || "", website: init.business_website || "", location: init.city || "",
    relationshipStatus: init.relationship_status || "historical",
    acquisitionSource: init.acquisition_source || "",
    services: Array.isArray(init.services) ? init.services.join(", ") : "",
    repeatValue: init.repeat_value ?? "", notes: init.brandnest_notes || "",
    nextFollowUp: init.brandnest_next_follow_up ? new Date(init.brandnest_next_follow_up).toISOString().slice(0, 10) : "",
  });
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setMsg("Saving…");
    const j = await api(`/api/admin/brandnest/clients/${leadId}`, "PATCH", {
      name: f.name, company: f.company, email: f.email, phone: f.phone, website: f.website, location: f.location,
      relationshipStatus: f.relationshipStatus, acquisitionSource: f.acquisitionSource || undefined,
      services: f.services.split(",").map((s: string) => s.trim()).filter(Boolean),
      repeatValue: f.repeatValue === "" ? null : Number(f.repeatValue),
      notes: f.notes, nextFollowUp: f.nextFollowUp || null,
    });
    if (j.ok) { setMsg("Saved."); setOpen(false); router.refresh(); }
    else setMsg(j.error || "failed");
  };
  if (!open) {
    return (
      <span className="flex items-center gap-2">
        <button onClick={() => { setOpen(true); setMsg(""); }} className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-semibold text-white">✏️ Edit client</button>
        {msg && <span className="text-xs text-grey">{msg}</span>}
      </span>
    );
  }
  const input = "rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white";
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input value={f.name} onChange={set("name")} placeholder="Client name" className={input} />
        <input value={f.company} onChange={set("company")} placeholder="Company" className={input} />
        <input value={f.email} onChange={set("email")} placeholder="Email" className={input} />
        <input value={f.phone} onChange={set("phone")} placeholder="Phone" className={input} />
        <input value={f.website} onChange={set("website")} placeholder="Website" className={input} />
        <input value={f.location} onChange={set("location")} placeholder="Location" className={input} />
        <select value={f.relationshipStatus} onChange={set("relationshipStatus")} className={input}>
          {["historical", "reactivation_candidate", "contacted", "reply_received", "requirement_identified", "quoted", "active_project", "delivered", "payment_pending", "paid", "repeat_client", "inactive", "converted_to_vyravo"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={f.acquisitionSource} onChange={set("acquisitionSource")} placeholder="Acquisition source" className={input} />
        <input value={f.services} onChange={set("services")} placeholder="Services (comma separated)" className={input} />
        <input value={f.repeatValue} onChange={set("repeatValue")} placeholder="Repeat-work value (₹)" type="number" className={input} />
        <input value={f.nextFollowUp} onChange={set("nextFollowUp")} type="date" className={input} />
      </div>
      <textarea value={f.notes} onChange={set("notes")} placeholder="Notes" rows={2} className={`${input} w-full`} />
      <div className="flex items-center gap-2">
        <button onClick={submit} className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">Save</button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs text-grey">Cancel</button>
        {msg && <span className="text-xs text-grey">{msg}</span>}
      </div>
    </div>
  );
}

export function DeleteClientButton({ leadId, name }: { leadId: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (!confirm(`Remove BrandNest record for "${name}"?\n\nProjects + BrandNest data are deleted. The contact itself is kept if it has any Vyravo history.`)) return;
    setBusy(true);
    const j = await api(`/api/admin/brandnest/clients/${leadId}`, "DELETE");
    setBusy(false);
    if (j.ok) {
      alert(j.note || "Removed.");
      router.push("/admin/brandnest/clients");
      router.refresh();
    } else alert(j.error || "Delete failed.");
  };
  return (
    <button onClick={go} disabled={busy} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 disabled:opacity-40">
      {busy ? "…" : "🗑 Delete"}
    </button>
  );
}

export function EditProjectForm({ p }: { p: any }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    service: p.service || "", amount: String(p.amount ?? ""), status: p.status || "pending",
    paymentMethod: p.payment_method || "", paymentDate: p.payment_date ? new Date(p.payment_date).toISOString().slice(0, 10) : "",
    deliveryDate: p.delivery_date ? new Date(p.delivery_date).toISOString().slice(0, 10) : "", notes: p.notes || "",
  });
  const [msg, setMsg] = useState("");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setMsg("Saving…");
    const j = await api(`/api/admin/brandnest/projects/${p.id}`, "PATCH", {
      service: f.service, amount: Number(f.amount), status: f.status,
      paymentMethod: f.paymentMethod, paymentDate: f.paymentDate || null,
      deliveryDate: f.deliveryDate || null, notes: f.notes,
    });
    if (j.ok) { setMsg(""); setOpen(false); router.refresh(); }
    else setMsg(j.error || "failed");
  };
  const del = async () => {
    if (!confirm(`Delete project #${p.id} (${p.service} — ${p.currency} ${p.amount})? This is a ledger correction and will change revenue totals.`)) return;
    const j = await api(`/api/admin/brandnest/projects/${p.id}`, "DELETE");
    if (j.ok) router.refresh();
    else alert(j.error || "Delete failed.");
  };
  if (!open) {
    return (
      <span className="flex gap-2">
        <button onClick={() => setOpen(true)} className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs text-grey hover:text-white">Edit</button>
        <button onClick={del} className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1 text-xs text-red-400/80 hover:text-red-400">Delete</button>
      </span>
    );
  }
  const input = "rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-white";
  return (
    <div className="w-full space-y-2 rounded-lg border border-border bg-surface-2/50 p-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input value={f.service} onChange={set("service")} placeholder="Service" className={input} />
        <input value={f.amount} onChange={set("amount")} placeholder="Amount" type="number" className={input} />
        <select value={f.status} onChange={set("status")} className={input}>
          {["pending", "partially_paid", "paid", "refunded", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={f.paymentMethod} onChange={set("paymentMethod")} placeholder="Method" className={input} />
        <input value={f.paymentDate} onChange={set("paymentDate")} type="date" className={input} />
        <input value={f.deliveryDate} onChange={set("deliveryDate")} type="date" className={input} />
        <input value={f.notes} onChange={set("notes")} placeholder="Notes" className={`${input} col-span-2`} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Save</button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs text-grey">Cancel</button>
        {msg && <span className="text-xs text-grey">{msg}</span>}
      </div>
    </div>
  );
}

export function OpportunityFlags({ leadId, current, categories }: { leadId: number; current: string; categories: string[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const setOpp = async (v: string) => {
    const j = await api(`/api/admin/brandnest/clients/${leadId}`, "PATCH", { vyravoOpportunity: v });
    setMsg(j.ok ? `Opportunity → ${v}` : (j.error || "failed"));
    if (j.ok) router.refresh();
  };
  const toggleCat = async (c: string) => {
    const next = categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c];
    const j = await api(`/api/admin/brandnest/clients/${leadId}`, "PATCH", { vyravoCategories: next });
    setMsg(j.ok ? "Categories saved (internal intel only — no automation triggered)." : (j.error || "failed"));
    if (j.ok) router.refresh();
  };
  const CATS = ["AI Chatbot", "WhatsApp Automation", "CRM Automation", "Lead Qualification", "Appointment Automation", "Email Automation", "Customer Support", "Internal Workflow Automation", "Voice Receptionist", "Other"];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-grey">Potential Vyravo opportunity:</span>
        {["none", "low", "medium", "high"].map((v) => (
          <button key={v} onClick={() => setOpp(v)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${current === v ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-border bg-surface-2 text-grey hover:text-white"}`}>{v}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {CATS.map((c) => (
          <button key={c} onClick={() => toggleCat(c)}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${categories.includes(c) ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-surface-2 text-grey-dark hover:text-white"}`}>{c}</button>
        ))}
      </div>
      {msg && <p className="text-xs text-grey">{msg}</p>}
    </div>
  );
}

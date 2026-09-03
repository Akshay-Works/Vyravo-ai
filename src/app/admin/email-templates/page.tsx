"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { TEMPLATE_VARS, renderTemplate, sampleTemplateData } from "@/lib/email/templates";

type Template = {
  id: number;
  name: string;
  email_type: string;
  subject: string;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  body_excerpt?: string;
};

type Lead = {
  id: number;
  full_name: string | null;
  email: string | null;
  business_name: string | null;
  business_website: string | null;
  industry: string | null;
  country: string | null;
  lead_score: number | null;
  lead_category: string | null;
  biggest_challenge: string | null;
  qualification_summary: string | null;
  status: string | null;
  stage: string | null;
};

const EMAIL_TYPES = [
  "campaign", "follow-up", "proposal-follow-up", "new-lead-confirmation",
  "discovery-call-confirmation", "onboarding", "project-update", "custom",
];

const scoreBadge = (s: number) =>
  s >= 90 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s >= 75 ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : s >= 60 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);

  // editor fields
  const [name, setName] = useState("");
  const [emailType, setEmailType] = useState("campaign");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // campaign flow
  const [showCampaign, setShowCampaign] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [queuing, setQueuing] = useState(false);
  const [notice, setNotice] = useState("");

  // send to the selected lead
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/email-templates");
      if (!r.ok) throw new Error("Failed to load templates");
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor = (t: Template | null) => {
    setEditing(t);
    setIsNew(!t);
    setName(t?.name || "");
    setEmailType(t?.email_type || "campaign");
    setSubject(t?.subject || "");
    setBody(t?.body || "");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    setNotice("");
    const url = editing ? `/api/admin/email-templates/${editing.id}` : "/api/admin/email-templates";
    const r = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, emailType, subject, body }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setNotice(d.error || "Save failed"); return; }
    setNotice(isNew ? "Template created ✓" : "Template saved ✓");
    setEditing(null); setIsNew(false);
    load();
  };

  const remove = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    const r = await fetch(`/api/admin/email-templates/${t.id}`, { method: "DELETE" });
    if (r.ok) load();
  };

  const duplicate = async (t: Template) => {
    const r = await fetch("/api/admin/email-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${t.name} (copy)`, emailType: t.email_type, subject: t.subject, body: t.body }),
    });
    if (r.ok) load();
  };

  // ---- campaign flow ----
  const openCampaign = async (t: Template) => {
    setEditing(t); setIsNew(false);
    setName(t.name); setEmailType(t.email_type); setSubject(t.subject); setBody(t.body);
    setShowCampaign(true); setNotice("");
    try {
      const r = await fetch("/api/admin/email-templates/leads?minScore=0");
      if (!r.ok) throw new Error();
      const d = await r.json();
      setLeads(d.leads || []);
      setSelectedIds(new Set((d.leads || []).slice(0, 5).map((l: Lead) => l.id)));
    } catch {
      setLeads([]);
    }
  };

  const toggleLead = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderedPreview = useMemo(() => {
    const data = previewLead
      ? {
          firstName: (previewLead.full_name || previewLead.business_name || "").split(/\s+/)[0] || "",
          fullName: previewLead.full_name || "",
          company: previewLead.business_name || previewLead.full_name || "",
          website: (previewLead.business_website || "").replace(/^https?:\/\//, ""),
          email: previewLead.email || "",
          country: previewLead.country || "",
          industry: previewLead.industry || "",
          score: previewLead.lead_score != null ? String(previewLead.lead_score) : "",
          category: (previewLead.lead_category || "").toUpperCase(),
          challenge: previewLead.biggest_challenge || previewLead.qualification_summary || "",
          summary: previewLead.qualification_summary || "",
        }
      : sampleTemplateData();
    return {
      subject: renderTemplate(subject, data),
      body: renderTemplate(body, data, { html: true }),
    };
  }, [subject, body, previewLead]);

  const queue = async () => {
    if (!editing) return;
    setQueuing(true);
    setNotice("");
    try {
      const r = await fetch(`/api/admin/email-templates/${editing.id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [...selectedIds] }),
      });
      const d = await r.json();
      if (!r.ok) { setNotice(d.error || "Queue failed"); return; }
      setNotice(`✓ Queued ${d.queued} personalized email${d.queued === 1 ? "" : "s"} (skipped ${d.skipped} without email / contacted)`);
      setShowCampaign(false);
      load();
    } finally {
      setQueuing(false);
    }
  };

  // Sends to the SELECTED LEAD's own email (the server resolves the
  // recipient from the lead row — never the admin's own address).
  const sendToLead = async () => {
    if (!editing) return;
    if (!previewLead) { setTestMsg("Select a lead first."); return; }
    const email = (previewLead.email || "").trim();
    if (!email) { setTestMsg("Lead has no email address — pick a lead with an email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTestMsg("Lead email address is invalid."); return; }
    setTesting(true);
    setTestMsg("");
    try {
      const r = await fetch(`/api/admin/email-templates/${editing.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: previewLead.id, subject, body }),
      });
      const d = await r.json();
      if (!r.ok) { setTestMsg(d.error || "Send failed"); return; }
      setTestMsg(`✓ Sent to ${d.to} via ${d.provider} — ${d.subject}`);
    } catch {
      setTestMsg("Send failed — network error");
    } finally {
      setTesting(false);
    }
  };

  const insertVar = (key: string) => {
    setBody((b) => b + (b && !b.endsWith("\n") ? "\n" : "") + `{{${key}}}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Email Templates</h1>
          <p className="mt-1 text-sm text-grey">Personalized templates with <code className="text-primary">{"{{variables}}"}</code> — reviewed by you, then queued for sending.</p>
        </div>
        <button onClick={() => openEditor(null)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          + New Template
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>
      )}

      {/* ============ LIST ============ */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
              <th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Subject</th>
              <th className="p-3">Updated</th><th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-6 text-grey">Loading…</td></tr>}
            {!loading && templates.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-grey">No templates yet — create your first one.</td></tr>
            )}
            {!loading && templates.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="p-3 text-white font-medium">{t.name}</td>
                <td className="p-3 text-grey">{t.email_type}</td>
                <td className="p-3 text-grey max-w-xs truncate">{t.subject}</td>
                <td className="p-3 text-grey">{new Date(t.updated_at).toLocaleString("en-IN")}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEditor(t)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-white hover:border-primary/50">Edit</button>
                    <button onClick={() => openCampaign(t)} className="rounded-lg border border-primary/40 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">Send to leads</button>
                    <button onClick={() => duplicate(t)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-grey hover:text-white">Copy</button>
                    <button onClick={() => remove(t)} className="rounded-lg border border-border px-2.5 py-1 text-xs text-red-400">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============ EDITOR ============ */}
      {(editing || isNew) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">{isNew ? "New template" : `Edit: ${editing?.name}`}</h2>
            <div>
              <label className="text-xs text-grey">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" placeholder="Intro — Qualified Lead" />
            </div>
            <div>
              <label className="text-xs text-grey">Email type</label>
              <select value={emailType} onChange={(e) => setEmailType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white">
                {EMAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-grey">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white" placeholder="Quick idea for {{company}} — {{score}}-point fit" />
            </div>
            <div>
              <label className="text-xs text-grey">Body (HTML — click a variable to insert)</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {TEMPLATE_VARS.map((v) => (
                  <button key={v.key} onClick={() => insertVar(v.key)} title={`${v.label} — e.g. ${v.sample}`}
                    className="rounded-md border border-border px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10">
                    {"{{" + v.key + "}}"}
                  </button>
                ))}
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14}
                className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-white"
                placeholder="<p>Hi {{firstName}},</p>…" />
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                {isNew ? "Create template" : "Save changes"}
              </button>
              <button onClick={() => { setEditing(null); setIsNew(false); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-grey hover:text-white">Cancel</button>
              {editing && (
                <button onClick={() => openCampaign(editing)}
                  className="rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary hover:bg-primary/10">
                  Send to leads →
                </button>
              )}
            </div>
          </div>

          {/* live preview */}
          <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">Live preview</h2>
              <select value={previewLead ? previewLead.id : 0} onChange={(e) => {
                  const id = Number(e.target.value);
                  setPreviewLead(id ? leads.find((l) => l.id === id) || null : null);
                }}
                className="rounded-lg border border-border bg-bg px-2 py-1 text-xs text-white">
                <option value={0}>Sample data</option>
                {leads.slice(0, 50).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.business_name || l.full_name} · {l.lead_score ?? "—"} pts
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">{renderedPreview.subject || "(subject)"}</p>
              <div className="prose-sm mt-2 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: renderedPreview.body || "<p>(body)</p>" }} />
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-grey">📨 Send this exact version (unsaved edits included) to the selected lead:</p>
              <div className="mt-2 flex gap-2">
                <button onClick={sendToLead} disabled={testing || !editing}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                  {testing ? "Sending…" : "Send to lead"}
                </button>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-grey-dark">
                <p><span className="text-grey">To:</span> {previewLead?.email || "— (select a lead above; sample data is never sent)"}</p>
                <p><span className="text-grey">Reply-To:</span> akshay.navale.work@gmail.com</p>
              </div>
              {testMsg && <p className={`mt-2 text-xs ${testMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{testMsg}</p>}
              <p className="mt-1 text-[11px] text-grey-dark">Never falls back to your own address — if the selected lead has no email, sending is blocked.</p>
            </div>
            <p className="text-xs text-grey">Values come from real lead data (score, company, challenge…). Nothing is fabricated — empty fields stay empty.</p>
          </div>
        </div>
      )}

      {/* ============ CAMPAIGN ============ */}
      {showCampaign && editing && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">
              Queue “{editing.name}” — {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected
            </h2>
            <button onClick={() => setShowCampaign(false)} className="text-xs text-grey hover:text-white">Close</button>
          </div>
          <p className="mt-1 text-xs text-grey">
            These go into the real email queue (status <code>pending</code>) and the worker sends them. Contradicted / contacted / won / lost leads are auto-skipped.
          </p>
          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border">
            {leads.length === 0 && <p className="p-4 text-sm text-grey">No leads with an email in the database.</p>}
            {leads.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2 text-sm last:border-0 hover:bg-white/5">
                <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleLead(l.id)} className="accent-[var(--primary)]" />
                <span className="flex-1 text-white">{l.business_name || l.full_name}</span>
                <span className="text-xs text-grey">{l.email}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${scoreBadge(l.lead_score ?? 0)}`}>{l.lead_score ?? "—"}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={queue} disabled={queuing || selectedIds.size === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {queuing ? "Queuing…" : `Queue ${selectedIds.size} email${selectedIds.size === 1 ? "" : "s"} for sending`}
            </button>
            <span className="text-xs text-grey">Check <a href="/admin/email-automation" className="text-primary underline">Email Automation</a> to track status.</span>
          </div>
        </div>
      )}

      {/* per-lead rendered previews for chosen leads */}
      {showCampaign && selectedIds.size > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-grey">Rendered for each lead (what they will receive)</h2>
          {leads.filter((l) => selectedIds.has(l.id)).map((l) => {
            const d = {
              firstName: (l.full_name || l.business_name || "").split(/\s+/)[0] || "",
              fullName: l.full_name || "",
              company: l.business_name || l.full_name || "",
              website: (l.business_website || "").replace(/^https?:\/\//, ""),
              email: l.email || "",
              country: l.country || "",
              industry: l.industry || "",
              score: l.lead_score != null ? String(l.lead_score) : "",
              category: (l.lead_category || "").toUpperCase(),
              challenge: l.biggest_challenge || l.qualification_summary || "",
              summary: l.qualification_summary || "",
            };
            return (
              <details key={l.id} className="rounded-xl border border-border bg-surface">
                <summary className="cursor-pointer p-3 text-sm text-white">
                  {l.business_name || l.full_name} — <span className="text-grey">{renderTemplate(subject, d)}</span>
                </summary>
                <div className="border-t border-border p-3">
                  <p className="text-xs text-grey mb-2">To: {l.email}</p>
                  <div className="rounded-lg border border-border bg-white p-4 text-sm text-slate-700"
                    dangerouslySetInnerHTML={{ __html: renderTemplate(body, d, { html: true }) }} />
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

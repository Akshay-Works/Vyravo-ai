"use client";
import { useCallback, useEffect, useState } from "react";

const QUEUES = [
  ["needs_reply", "Needs reply"], ["review", "Review"], ["drafts", "Drafts"],
  ["sent", "Sent"], ["failed", "Failed"], ["ignored", "Ignored"],
] as const;

export default function InboxPage() {
  const [queue, setQueue] = useState<string>("needs_reply");
  const [data, setData] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [subj, setSubj] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async (q: string) => {
    setThread(null); setSel(null);
    const r = await fetch(`/api/admin/inbox?queue=${q}&limit=60`);
    setData(await r.json());
  }, []);
  // Initial queue load on mount / queue switch (legitimate fetch-on-view).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(queue); }, [queue, load]);

  const openThread = async (threadId: string, m: any) => {
    const r = await fetch(`/api/admin/inbox?thread=${encodeURIComponent(threadId)}`);
    const t = await r.json();
    setThread(t); setSel(m);
    setSubj(m.ai_reply_subject || "");
    setBody(m.ai_reply_body || "");
  };

  const act = async (payload: any) => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/inbox/action", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "failed");
      setMsg("Done ✓");
      if (sel) await openThread(sel.thread_id, { ...sel, ai_reply_subject: subj, ai_reply_body: body });
      else await load(queue);
    } catch (e: any) { setMsg(`Error: ${e.message}`); }
    setBusy(false);
  };

  const c = data?.counts || {};
  const input: React.CSSProperties = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer", fontSize: 13 };
  const btnPrimary: React.CSSProperties = { ...btn, background: "#111", color: "#fff", borderColor: "#111" };

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, fontFamily: "system-ui" }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Inbox</h2>
        {QUEUES.map(([k, label]) => (
          <button key={k} onClick={() => setQueue(k)} disabled={busy}
            style={{ ...btn, width: "100%", textAlign: "left", marginBottom: 6, fontWeight: queue === k ? 700 : 400,
              background: queue === k ? "#eee" : "#fff" }}>
            {label} ({c[k] ?? "–"})
          </button>
        ))}
        <div style={{ marginTop: 12, fontSize: 13, color: "#555" }}>
          Contacts new: {c.contacts ?? "–"}<br />Follow-ups due: {c.followups ?? "–"}
        </div>
        <a href="/admin/outreach" style={{ fontSize: 13 }}>→ Outreach</a>
      </div>

      <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid #ddd", paddingLeft: 16 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>{data?.queue || queue} ({data?.messages?.length ?? 0})</h3>
        {(data?.messages || []).map((m: any) => (
          <div key={m.message_id} onClick={() => openThread(m.thread_id, m)}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, marginBottom: 8, cursor: "pointer",
              background: sel?.message_id === m.message_id ? "#f0f6ff" : "#fff" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.from_name || m.from_email}</div>
            <div style={{ fontSize: 13 }}>{m.subject}</div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {m.classification || "—"}{m.confidence != null ? ` (${Number(m.confidence).toFixed(2)})` : ""} · {m.status}
              {m.business_name ? ` · ${m.business_name.slice(0, 40)}` : ""}
            </div>
          </div>
        ))}
        {data && (data.messages || []).length === 0 && <div style={{ fontSize: 13, color: "#777" }}>Empty ✓</div>}
      </div>

      <div style={{ flex: 1, borderLeft: "1px solid #ddd", paddingLeft: 16, minWidth: 0 }}>
        {!sel && <div style={{ color: "#777" }}>Select a message →</div>}
        {sel && thread && (
          <div>
            <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{sel.subject}</h3>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>
              From {sel.from_email} · {sel.classification || "?"} ({sel.confidence != null ? Number(sel.confidence).toFixed(2) : "?"})
              · lead {sel.lead_id || "—"} {sel.business_name ? `(${sel.business_name.slice(0, 50)})` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>Auto-reply this thread:</span>
              <button style={btn} disabled={busy}
                onClick={() => act({ action: "toggle_auto", thread_id: sel.thread_id, auto_reply: !(thread.pref?.auto_reply !== false) })}>
                {thread.pref?.auto_reply !== false ? "ON → turn OFF" : "OFF → turn ON"}
              </button>
              <button style={btn} disabled={busy} onClick={() => act({ action: "mark_handled", message_id: sel.message_id })}>Mark handled</button>
              <button style={btn} disabled={busy} onClick={() => act({ action: "reject", message_id: sel.message_id })}>Reject</button>
            </div>
            {(thread.messages || []).map((m: any) => (
              <div key={m.message_id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 8, marginBottom: 8,
                background: m.direction === "out" ? "#f7f7f7" : "#fff" }}>
                <div style={{ fontSize: 12, color: "#666" }}>{m.direction === "out" ? "Us" : m.from_email} · {m.status}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{String(m.body_text || "").slice(0, 2000)}</div>
              </div>
            ))}
            <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>AI draft (edit + approve)</h4>
            <input style={{ ...input, marginBottom: 6 }} value={subj} onChange={(e) => setSubj(e.target.value)} placeholder="Subject" />
            <textarea style={{ ...input, height: 180 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply body" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={btnPrimary} disabled={busy} onClick={() => act({ action: "approve_send", message_id: sel.message_id, subject: subj, body })}>Approve + send</button>
              <button style={btn} disabled={busy} onClick={() => act({ action: "save_draft", message_id: sel.message_id, subject: subj, body })}>Save draft</button>
            </div>
            {(thread.contacts || []).length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Extracted contacts</h4>
                {(thread.contacts || []).map((ct: any) => (
                  <div key={ct.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
                    <b>{ct.email}</b> {ct.name ? `(${ct.name}${ct.title ? `, ${ct.title}` : ""}${ct.company ? ` @ ${ct.company}` : ""})` : ""}
                    <div style={{ color: "#555" }}>{ct.relationship || ""} {ct.reason ? `— ${ct.reason}` : ""}</div>
                    <div style={{ color: "#555" }}>action: {ct.recommended_action} · conf: {ct.confidence} · {ct.status}</div>
                    {ct.status === "new" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button style={btn} disabled={busy} onClick={() => act({ action: "approve_contact", contact_id: ct.id })}>Approve + contact</button>
                        <button style={btn} disabled={busy} onClick={() => act({ action: "ignore_contact", contact_id: ct.id })}>Ignore</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Audit trail</h4>
            <div style={{ fontSize: 12, color: "#555" }}>
              {(thread.audit || []).map((a: any) => (
                <div key={a.id}>[{String(a.created_at).slice(0, 19).replace("T", " ")}] {a.actor}: {a.action} {JSON.stringify(a.detail).slice(0, 120)}</div>
              ))}
            </div>
          </div>
        )}
        {msg && <div style={{ marginTop: 12, fontSize: 13 }}>{msg}</div>}
      </div>
    </div>
  );
}

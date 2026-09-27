"use client";
import { useCallback, useEffect, useState } from "react";

export default function SalesCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [outbox, setOutbox] = useState<any[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/sales/metrics");
    setData(await r.json());
    try {
      const o = await fetch("/api/admin/sales/outbox");
      setOutbox(((await o.json()).held || []) as any[]);
    } catch { /* outbox secondary */ }
  }, []);
  // Initial load (legitimate fetch-on-view).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const escAction = async (id: number, action: string) => {
    setBusy(true);
    await fetch("/api/admin/sales/escalations/action", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    await load(); setBusy(false);
  };
  const flipPause = async () => {
    const paused = !!data?.metrics?.paused;
    if (!paused && !confirm("PAUSE all automated sales sending? (Approvals + transactional mail keep working.)")) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/admin/sales/pause", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !paused }),
    });
    const j = await r.json();
    setMsg(j.paused ? "⏸ Sales automation PAUSED." : "▶ Sales automation RESUMED.");
    await load(); setBusy(false);
  };

  const card: React.CSSProperties = { border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "#fff" };
  const num: React.CSSProperties = { fontSize: 26, fontWeight: 700 };
  const lbl: React.CSSProperties = { fontSize: 12, color: "#666" };
  const h: React.CSSProperties = { fontSize: 15, margin: "18px 0 8px" };
  const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer", fontSize: 13 };

  if (!data) return <div style={{ padding: 24 }}>Loading sales command center…</div>;
  const t = data.metrics?.today || {};
  const ai = data.metrics?.ai || {};
  const paused = !!data.metrics?.paused;
  const actions = data.actions || [];

  const grid = (entries: [string, any][]) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={card}><div style={num}>{v ?? 0}</div><div style={lbl}>{k.replace(/_/g, " ")}</div></div>
      ))}
    </div>
  );

  return (
    <div style={{ padding: 20, fontFamily: "system-ui", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Sales Command Center</h1>
        <button onClick={flipPause} disabled={busy}
          style={{ ...btn, background: paused ? "#0a7d2c" : "#b30000", color: "#fff", borderColor: "transparent", fontWeight: 700 }}>
          {paused ? "▶ RESUME SALES AUTOMATION" : "⏸ PAUSE SALES AUTOMATION"}
        </button>
        <a href="/admin/inbox" style={{ fontSize: 13 }}>→ Inbox</a>
        <a href="/admin/outreach" style={{ fontSize: 13 }}>→ Outreach</a>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
      {paused && <div style={{ ...card, marginTop: 12, background: "#fff3f3", borderColor: "#d00", fontWeight: 600 }}>⏸ Sales sending is PAUSED. No automated sales emails will go out until you resume.</div>}

      <h2 style={h}>🔥 Founder actions required ({actions.length})</h2>
      {actions.length === 0 && <div style={{ ...card, color: "#0a7d2c" }}>Nothing needs you. The pipeline is driving itself. ✓</div>}
      {actions.map((a: any) => (
        <div key={a.id} style={{ ...card, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: "#555" }}>#{a.id} · {a.kind} · {a.business_name || a.lead_email || ""} {a.lead_score != null ? `(score ${a.lead_score})` : ""}</div>
          <div style={{ fontWeight: 700, margin: "4px 0" }}>{a.title}</div>
          <div style={{ fontSize: 13 }}>{a.detail}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}><b>AI recommends:</b> {a.recommendation}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btn} disabled={busy} onClick={() => escAction(a.id, "ack")}>Acknowledge</button>
            <button style={btn} disabled={busy} onClick={() => escAction(a.id, "resolve")}>Resolve</button>
          </div>
        </div>
      ))}

      <h2 style={h}>Outbox — held for approval ({outbox.length})</h2>
      {outbox.length === 0 && <div style={{ fontSize: 13, color: "#777" }}>No held emails. ✓</div>}
      {outbox.map((o: any) => (
        <div key={o.id} style={{ ...card, marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: "#555" }}>#{o.id} · {o.email_type} · {o.business_name || o.lead_email || ""} → {o.template_data?.to}</div>
          <div style={{ fontWeight: 700, margin: "4px 0" }}>{o.template_data?.subject}</div>
          <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{String(o.template_data?.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {(["approve", "send_now", "discard"] as const).map((a) => (
              <button key={a} style={btn} disabled={busy} onClick={async () => {
                setBusy(true);
                await fetch("/api/admin/sales/outbox", { method: "POST",
                  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, action: a }) });
                await load(); setBusy(false);
              }}>{a === "send_now" ? "Send now" : a[0].toUpperCase() + a.slice(1)}</button>
            ))}
          </div>
        </div>
      ))}

      <h2 style={h}>Today&apos;s sales</h2>
      {grid([["new_leads", t.new_leads], ["contacted", t.contacted], ["replies", t.replies], ["positive_replies", t.positive_replies], ["qualified", t.qualified], ["meetings_booked", t.meetings_booked], ["proposals_created", t.proposals_created], ["proposals_sent", t.proposals_sent], ["won", t.won], ["lost", t.lost]])}

      <h2 style={h}>AI activity today</h2>
      {grid([["emails_sent", ai.emails_sent], ["replies_handled", ai.replies_handled], ["followups_sent", ai.followups_sent], ["leads_researched", ai.leads_researched], ["contacts_discovered", ai.contacts_discovered], ["meetings_booked", ai.meetings_booked], ["proposals_generated", ai.proposals_generated], ["escalated", ai.escalated]])}

      <h2 style={h}>Pipeline funnel (all leads)</h2>
      <div style={card}>
        {Object.entries(data.metrics?.funnel || {}).map(([s, n]: any) => (
          <div key={s} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0", borderBottom: "1px solid #f0f0f0" }}>
            <span>{s}</span><b>{n}</b>
          </div>
        ))}
      </div>

      <h2 style={h}>Revenue &amp; pipeline value</h2>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Accepted (revenue):</div>
        {(data.metrics?.revenue_accepted || []).map((r: any) => (
          <div key={r.currency} style={{ fontSize: 13 }}>{r.currency}: {r.n} deals · {Number(r.t).toLocaleString("en-IN")}</div>
        ))}
        {(data.metrics?.revenue_accepted || []).length === 0 && <div style={{ fontSize: 13, color: "#777" }}>No accepted proposals yet.</div>}
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Open pipeline:</div>
        {(data.metrics?.pipeline_value || []).map((r: any) => (
          <div key={r.currency} style={{ fontSize: 13 }}>{r.currency}: {r.n} open · {Number(r.t).toLocaleString("en-IN")}</div>
        ))}
      </div>

      <h2 style={h}>Best opportunities</h2>
      {(data.opportunities || []).map((o: any) => (
        <div key={o.id} style={{ ...card, marginBottom: 6, fontSize: 13 }}>
          <b>{o.business_name || o.email}</b> · {o.stage} · score {o.lead_score}
          {o.budget_range ? ` · budget ${o.budget_range}` : ""}{o.timeline ? ` · ${o.timeline}` : ""}
        </div>
      ))}
      {(data.opportunities || []).length === 0 && <div style={{ fontSize: 13, color: "#777" }}>No engaged opportunities right now.</div>}

      <h2 style={h}>Tomorrow&apos;s queue</h2>
      <div style={card}><div style={{ fontSize: 13 }}>Outreach pending: <b>{data.tomorrow?.outreach_pending ?? "–"}</b> · Generic pending: <b>{data.tomorrow?.generic_pending ?? "–"}</b></div></div>

      <h2 style={h}>Problems detected ({(data.failures || []).length})</h2>
      {(data.failures || []).map((f: any, i: number) => (
        <div key={i} style={{ ...card, marginBottom: 6, fontSize: 12 }}>
          [{f.source} #{f.id}] lead {f.lead_id} — {f.error} {f.context ? `(${f.context})` : ""}
        </div>
      ))}
      {(data.failures || []).length === 0 && <div style={{ fontSize: 13, color: "#0a7d2c" }}>No failures on record. ✓</div>}
    </div>
  );
}

import Link from "next/link";
import { pool } from "@/db";
import { stageLabel } from "@/lib/sales/stages";
import { OverrideForm } from "./OverrideForm";

export const dynamic = "force-dynamic";

const fmtDate = (d: any) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const fmtMoney = (v: any, c: string) => (v == null ? "—" : `${c || "INR"} ${Number(v).toLocaleString("en-IN")}`);

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  const lead = (await pool.query(`SELECT * FROM leads WHERE id = $1`, [leadId])).rows[0];
  if (!lead) {
    return (
      <div className="space-y-4">
        <Link href="/admin/crm/leads" className="text-sm text-primary hover:underline">← Back to CRM Leads</Link>
        <p className="text-grey">Lead #{id} not found.</p>
      </div>
    );
  }
  const stage = String(lead.stage || "new");
  const biz = String(lead.business_source || "vyravo_ai");
  const bn = (await pool.query(`SELECT relationship_status FROM brandnest_clients WHERE lead_id = $1`, [leadId]).catch(() => ({ rows: [] as any[] }))).rows[0];
  const escs = (await pool.query(
    `SELECT id, kind, title, status, created_at FROM sales_escalations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 10`, [leadId]).catch(() => ({ rows: [] as any[] }))).rows;
  const open = escs.filter((e: any) => e.status === "open");

  const items: any[] = [];
  const grab = async (sql: string, map: (r: any) => any) => {
    try {
      const r = await pool.query(sql, [leadId]);
      for (const row of r.rows) items.push(map(row));
    } catch {}
  };
  await grab(`SELECT action, description, created_at FROM activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 60`,
    (r) => ({ at: r.created_at, kind: "activity", title: r.action, detail: r.description }));
  await grab(`SELECT action, from_stage, to_stage, reason, autonomy, created_at FROM sales_decisions WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 60`,
    (r) => ({ at: r.created_at, kind: "decision", title: r.action, detail: `${r.from_stage || ""}${r.to_stage ? ` → ${r.to_stage}` : ""} ${r.reason || ""} [${r.autonomy}]`.trim() }));
  await grab(`SELECT event_type, result, created_at FROM sales_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 60`,
    (r) => ({ at: r.created_at, kind: "lifecycle", title: r.event_type, detail: r.result || "" }));
  await grab(`SELECT direction, subject, classification, COALESCE(sent_at, processed_at, created_at) AS at FROM inbox_messages WHERE lead_id = $1 ORDER BY at DESC LIMIT 40`,
    (r) => ({ at: r.at, kind: r.direction === "out" ? "email_out" : "email_in", title: r.direction === "out" ? "Email sent" : "Email received", detail: `${r.subject || ""}${r.classification ? ` [${r.classification}]` : ""}`.trim() }));
  await grab(`SELECT follow_up_number, status, subject, COALESCE(sent_at, created_at) AS at FROM outreach_events WHERE lead_id = $1 ORDER BY at DESC LIMIT 30`,
    (r) => ({ at: r.at, kind: "outreach", title: `Outreach #${r.follow_up_number} — ${r.status}`, detail: r.subject || "" }));
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const lastActivity = items[0];
  const kindColor: Record<string, string> = {
    activity: "border-border text-grey", decision: "border-blue-500/30 text-blue-400",
    lifecycle: "border-primary/30 text-primary", email_in: "border-green-500/30 text-green-400",
    email_out: "border-amber-500/30 text-amber-400", outreach: "border-purple-500/30 text-purple-400",
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/crm/leads" className="text-sm text-primary hover:underline">← Back to CRM Leads</Link>

      {/* Header: where is this lead in the sales process? */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-heading)] text-xl font-semibold text-white">
              {lead.business_name || lead.full_name || `Lead #${lead.id}`}
            </h1>
            <p className="mt-1 text-sm text-grey">
              {lead.full_name && lead.business_name ? `${lead.full_name} · ` : ""}{lead.email || "no email"}{lead.phone ? ` · ${lead.phone}` : ""}
              {(lead.city || lead.country) ? ` · ${[lead.city, lead.country].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
              {stageLabel(stage)}
            </span>
            {(bn || biz !== "vyravo_ai") && (
              <Link href={`/admin/brandnest/clients/${leadId}`}
                className="rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-400 hover:underline">
                🎨 BrandNest — {(bn?.relationship_status || "").replace(/_/g, " ") || biz}
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Deal value</div>
            <div className="mt-1 font-semibold text-white">{fmtMoney(lead.deal_value, lead.deal_currency)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Sales readiness (score)</div>
            <div className="mt-1 font-semibold text-white">{lead.lead_score ?? 0}{lead.reply_class ? ` · ${lead.reply_class}` : ""}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Last activity</div>
            <div className="mt-1 text-sm text-white">{lastActivity ? `${lastActivity.title} · ${fmtDate(lastActivity.at)}` : "—"}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Next automated action</div>
            <div className="mt-1 text-sm text-white">{lead.next_action || "—"}</div>
            <div className="text-xs text-grey-dark">{lead.next_action_date ? fmtDate(lead.next_action_date) : ""}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${open.length ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-green-500/30 bg-green-500/10 text-green-400"}`}>
            {open.length ? `🔥 Founder attention: ${open.length} open` : "Founder action: none"}
          </span>
          <OverrideForm leadId={leadId} current={stage} />
        </div>
        {open.length > 0 && (
          <div className="mt-3 space-y-1">
            {open.map((e: any) => (
              <div key={e.id} className="text-xs text-grey">#{e.id} <span className="text-white">{e.title}</span> <span className="text-grey-dark">({e.kind})</span></div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-white">Timeline</h2>
        <p className="mt-0.5 text-xs text-grey-dark">Communication + automation history. Sales stage above = commercial state.</p>
        <div className="mt-4 space-y-2">
          {items.length === 0 && <p className="text-sm text-grey">No activity yet.</p>}
          {items.slice(0, 120).map((t: any, i: number) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-grey-dark">{fmtDate(t.at)}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${kindColor[t.kind] || "border-border text-grey"}`}>{t.kind}</span>
              <div className="min-w-0">
                <span className="font-medium text-white">{t.title}</span>
                {t.detail && <span className="text-grey"> — {String(t.detail).slice(0, 220)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

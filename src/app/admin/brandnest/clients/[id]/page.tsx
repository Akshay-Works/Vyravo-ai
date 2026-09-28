import Link from "next/link";
import { pool } from "@/db";
import { getBrandNestClient } from "@/lib/brandnest/clients";
import { listProjects } from "@/lib/brandnest/projects";
import { BRANDNEST_STATUS_LABELS, REACTIVATION_LABELS, businessLabel } from "@/lib/brandnest/schema";
import { stageLabel } from "@/lib/sales/stages";
import { ConvertButton, ReactivateControls, AddProjectForm, OpportunityFlags, EditClientForm, DeleteClientButton, EditProjectForm } from "../../BrandNestActions";
import { MarkPaidClient } from "../../BrandNestPay";

export const dynamic = "force-dynamic";

const fmtD = (d: any) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const inr = (v: any) => (v == null ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default async function BrandNestClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  const c = await getBrandNestClient(leadId);
  if (!c) {
    return (
      <div className="space-y-4">
        <Link href="/admin/brandnest/clients" className="text-sm text-primary hover:underline">← Back to clients</Link>
        <p className="text-grey">BrandNest client #{id} not found.</p>
      </div>
    );
  }
  const projects = await listProjects(leadId);
  const converted = String(c.business_source) === "brandnest_to_vyravo";

  // Unified timeline: every item labeled [BRANDNEST] or [VYRAVO].
  const items: any[] = [];
  const grab = async (sql: string, map: (r: any) => any) => {
    try {
      const r = await pool.query(sql, [leadId]);
      for (const row of r.rows) items.push(map(row));
    } catch {}
  };
  await grab(`SELECT action, description, created_at FROM activities WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 80`,
    (r) => {
      const isBN = /brandnest/i.test(`${r.action} ${r.description}`);
      return { at: r.created_at, biz: isBN ? "BRANDNEST" : "VYRAVO", title: r.action, detail: r.description };
    });
  await grab(`SELECT event_type, result, created_at FROM sales_events WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 60`,
    (r) => ({ at: r.created_at, biz: "VYRAVO", title: r.event_type, detail: r.result || "" }));
  await grab(`SELECT direction, subject, COALESCE(sent_at, processed_at, created_at) AS at FROM inbox_messages WHERE lead_id = $1 ORDER BY at DESC LIMIT 30`,
    (r) => ({ at: r.at, biz: "VYRAVO", title: r.direction === "out" ? "Email sent" : "Email received", detail: r.subject || "" }));
  for (const p of projects) {
    items.push({ at: p.payment_date || p.created_date, biz: "BRANDNEST", title: `Project: ${p.service}`, detail: `${p.currency} ${p.amount} — ${p.status}` });
    if (p.status === "paid" && p.payment_date) items.push({ at: p.payment_date, biz: "BRANDNEST", title: "Payment received", detail: `${p.currency} ${p.amount} (${p.payment_method || "—"})` });
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const services: string[] = Array.isArray(c.services) ? c.services : [];
  const cats: string[] = Array.isArray(c.vyravo_categories) ? c.vyravo_categories : [];

  return (
    <div className="space-y-6">
      <Link href="/admin/brandnest/clients" className="text-sm text-primary hover:underline">← Back to clients</Link>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-heading)] text-xl font-semibold text-white">{c.business_name || c.full_name}</h1>
            <p className="mt-1 text-sm text-grey">
              {c.full_name && c.business_name ? `${c.full_name} · ` : ""}{c.email || "no email"}{c.phone ? ` · ${c.phone}` : ""}{c.city ? ` · ${c.city}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-semibold text-primary">
                🎨 BrandNest — {BRANDNEST_STATUS_LABELS[c.relationship_status] || c.relationship_status}
              </span>
              <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-grey">
                {businessLabel(c.business_source)}{converted || c.business_source === "vyravo_ai" ? ` · Vyravo: ${stageLabel(c.stage || "new")}` : ""}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Historical revenue</div>
            <div className="text-xl font-semibold text-white">{inr(c.total_revenue)}</div>
            <div className="text-xs text-grey-dark">{c.project_count} project(s)</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Services purchased</div>
            <div className="mt-1 text-sm text-white">{services.length ? services.join(", ") : projects.map((p: any) => p.service).slice(0, 5).join(", ") || "—"}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Last project / payment</div>
            <div className="mt-1 text-sm text-white">{fmtD(c.last_project_date)} / {fmtD(c.last_payment_date)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Repeat-work value</div>
            <div className="mt-1 text-sm text-white">{inr(c.repeat_value)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-xs uppercase tracking-wider text-grey-dark">Source / next follow-up</div>
            <div className="mt-1 text-sm text-white">{c.acquisition_source || "—"} / {fmtD(c.brandnest_next_follow_up)}</div>
          </div>
        </div>
        {c.brandnest_notes && <p className="mt-3 text-sm text-grey">📝 {c.brandnest_notes}</p>}

        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <OpportunityFlags leadId={leadId} current={c.vyravo_opportunity || "none"} categories={cats} />
          <ReactivateControls leadId={leadId} current={REACTIVATION_LABELS[c.reactivation_status] || c.reactivation_status} />
          <div className="flex flex-wrap items-center gap-3">
            <ConvertButton leadId={leadId} already={converted} />
            <DeleteClientButton leadId={leadId} name={c.business_name || c.full_name || `#${leadId}`} />
          </div>
          <EditClientForm leadId={leadId} init={c} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-white">Projects &amp; transactions</h2>
        <div className="mt-3 space-y-2">
          {projects.length === 0 && <p className="text-sm text-grey">No projects recorded. Record real transactions only.</p>}
          {projects.map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <div>
                <span className="font-medium text-white">#{p.id} {p.service}</span>
                <span className="text-grey"> — {p.currency} {p.amount} · {p.status}{p.payment_method ? ` · ${p.payment_method}` : ""}{p.payment_date ? ` · paid ${fmtD(p.payment_date)}` : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                {p.status !== "paid" && p.status !== "cancelled" && <MarkPaid id={p.id} />}
                <EditProjectForm p={p} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-border pt-4"><AddProjectForm leadId={leadId} /></div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-white">Unified timeline</h2>
        <p className="mt-0.5 text-xs text-grey-dark">One relationship history — every item labeled by business.</p>
        <div className="mt-4 space-y-2">
          {items.length === 0 && <p className="text-sm text-grey">No activity yet.</p>}
          {items.slice(0, 120).map((t: any, i: number) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-grey-dark">{fmtD(t.at)}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.biz === "BRANDNEST" ? "border-purple-500/40 text-purple-400" : "border-primary/40 text-primary"}`}>[{t.biz}]</span>
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

function MarkPaid({ id }: { id: number }) {
  return <MarkPaidClient id={id} />;
}

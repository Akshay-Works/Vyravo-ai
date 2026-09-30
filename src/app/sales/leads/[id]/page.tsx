import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSalesLead } from "@/lib/sales-workspace/ops";
import SalesActions from "@/components/SalesActions";

export const dynamic = "force-dynamic";

export default async function SalesLeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const { id } = await params;
  const d = await getSalesLead(user, Number(id));
  if (!d) notFound();
  const { lead: l } = d;
  return (
    <div className="space-y-4">
      <Link href="/sales/leads" className="text-xs text-primary">← All leads</Link>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-[var(--font-heading)] text-lg font-bold">{l.business_name || l.full_name || `Lead #${l.id}`}</h1>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-grey">{(l.stage || "new").replace(/_/g, " ")}</span>
          {typeof l.lead_score === "number" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">score {l.lead_score}</span>}
        </div>
        <div className="mt-2 grid gap-1 text-sm text-grey sm:grid-cols-2">
          {l.full_name && <span>👤 {l.full_name}</span>}
          {l.email && <span>✉️ {l.email}</span>}
          {l.phone && <span>📞 {l.phone}</span>}
          {[l.city, l.country].filter(Boolean).length > 0 && <span>📍 {[l.city, l.country].filter(Boolean).join(", ")}</span>}
          {l.business_website && <span className="truncate">🌐 {l.business_website}</span>}
          {l.industry && <span>🏭 {l.industry}</span>}
          {l.deal_value ? <span>💰 {l.deal_currency || "INR"} {l.deal_value}</span> : null}
          {l.next_follow_up && <span>⏰ Next: {new Date(l.next_follow_up).toLocaleString("en-IN")}</span>}
          {user.role === "admin" && l.owner_name ? <span>👔 {l.owner_name}</span> : null}
        </div>
        {l.next_action && <p className="mt-2 rounded-lg bg-primary/10 p-2 text-xs text-primary">Next: {l.next_action}</p>}
      </div>

      <SalesActions leadId={l.id} admin={user.role === "admin"} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">📞 Call log ({d.calls.length})</h2>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {d.calls.map((c: any) => (
              <div key={c.id} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.outcome.replace(/_/g, " ")}</span>
                  <span className="ml-auto text-grey-dark">{new Date(c.created_at).toLocaleString("en-IN")}</span>
                </div>
                {c.notes && <p className="mt-1 text-grey">{c.notes}</p>}
                <p className="text-grey-dark">by {c.by_name || "?"}{c.next_follow_up ? ` · next: ${new Date(c.next_follow_up).toLocaleDateString("en-IN")}` : ""}</p>
              </div>
            ))}
            {d.calls.length === 0 && <p className="text-xs text-grey">No calls logged yet.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">💬 Email history ({d.mail.length})</h2>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {d.mail.map((m: any, i: number) => (
              <div key={i} className="rounded-lg border border-border bg-surface-2 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span>{m.direction === "inbound" ? "📥" : "📤"}</span>
                  <span className="truncate font-medium">{m.subject || "(no subject)"}</span>
                </div>
                <p className="text-grey-dark">{m.classification || ""} · {m.at ? new Date(m.at).toLocaleDateString("en-IN") : ""}</p>
              </div>
            ))}
            {d.mail.length === 0 && <p className="text-xs text-grey">No emails yet.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">🧾 Activity ({d.activity.length})</h2>
        <div className="max-h-64 space-y-1.5 overflow-y-auto text-xs text-grey">
          {d.activity.map((a: any, i: number) => (
            <p key={i}><span className="text-grey-dark">{a.created_at ? new Date(a.created_at).toLocaleString("en-IN") : ""}</span> — {a.description}</p>
          ))}
          {d.activity.length === 0 && <p>No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}

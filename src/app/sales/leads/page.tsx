import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { listSalesLeads } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

const STAGES = ["", "new", "contacted", "qualified", "meeting_booked", "proposal_sent", "negotiation", "won", "lost"];

export default async function SalesLeads({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const sp = await searchParams;
  const leads = await listSalesLeads(user, { q: sp.q, stage: sp.stage });
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">{user.role === "admin" ? "All leads" : "My leads"} ({leads.length})</h1>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q || ""} placeholder="Search name, company, email…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <select name="stage" defaultValue={sp.stage || ""}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white">
          {STAGES.map((s) => <option key={s} value={s}>{s === "" ? "All stages" : s.replace(/_/g, " ")}</option>)}
        </select>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">Filter</button>
      </form>
      <div className="space-y-2">
        {leads.map((l) => (
          <Link key={l.id} href={`/sales/leads/${l.id}`}
            className="block rounded-xl border border-border bg-surface p-3 hover:border-primary/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{l.business_name || l.full_name || `Lead #${l.id}`}</span>
              {typeof l.lead_score === "number" && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${l.lead_score >= 60 ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-2 text-grey"}`}>
                  {l.lead_score}
                </span>
              )}
              {l.open_tasks > 0 && <span className="text-[11px] text-amber-400">📌{l.open_tasks}</span>}
              <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-grey">
                {(l.stage || "new").replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-grey">
              {[l.full_name, l.city, l.country].filter(Boolean).join(" · ")}
              {user.role === "admin" && l.owner_name ? ` · 👤 ${l.owner_name}` : ""}
              {l.reply_received ? " · 💬 replied" : ""}
            </div>
          </Link>
        ))}
        {leads.length === 0 && <p className="text-sm text-grey">No leads found. New assignments appear here automatically.</p>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { listBrandNestClients } from "@/lib/brandnest/clients";
import { BRANDNEST_STATUS_LABELS, REACTIVATION_LABELS } from "@/lib/brandnest/schema";

export const dynamic = "force-dynamic";

const inr = (v: any) => (v == null ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);

export default async function BrandNestClientsPage({ searchParams }: { searchParams: Promise<{ status?: string; opportunity?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await listBrandNestClients({ status: sp.status, opportunity: sp.opportunity, q: sp.q });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">BrandNest Clients</h1>
          <p className="mt-1 text-sm text-grey">{rows.length} client{rows.length === 1 ? "" : "s"} · unified contacts (shared with Vyravo CRM, never duplicated)</p>
        </div>
        <Link href="/admin/brandnest" className="text-sm text-primary hover:underline">← Dashboard</Link>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q || ""} placeholder="Search name, company, email, phone…"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white" />
        <select name="opportunity" defaultValue={sp.opportunity || ""} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white">
          <option value="">All opportunities</option>
          {["none", "low", "medium", "high"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-grey hover:text-white">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
              <th className="p-3">Client</th><th className="p-3">Contact</th><th className="p-3">Relationship</th>
              <th className="p-3">Projects</th><th className="p-3">Revenue</th><th className="p-3">Reactivation</th><th className="p-3">Vyravo opp</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-grey">No BrandNest clients yet. Add real clients only — never fabricate.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="p-3">
                  <Link href={`/admin/brandnest/clients/${r.id}`} className="font-medium text-white hover:text-primary hover:underline">
                    {r.business_name || r.full_name}
                  </Link>
                  {r.business_name && r.full_name && <div className="text-xs text-grey-dark">{r.full_name}</div>}
                </td>
                <td className="p-3 text-grey">
                  {r.email ? <div>✉ {r.email}</div> : <div className="text-grey-dark">✉ —</div>}
                  {r.phone ? <div>☎ {r.phone}</div> : null}
                </td>
                <td className="p-3"><span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-grey">{BRANDNEST_STATUS_LABELS[r.relationship_status] || r.relationship_status}</span></td>
                <td className="p-3 text-grey">{r.project_count}</td>
                <td className="p-3 font-medium text-white">{inr(r.total_revenue)}</td>
                <td className="p-3 text-grey">{REACTIVATION_LABELS[r.reactivation_status] || r.reactivation_status}</td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${r.vyravo_opportunity === "high" ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : r.vyravo_opportunity === "medium" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-border text-grey-dark"}`}>
                    {r.vyravo_opportunity || "none"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

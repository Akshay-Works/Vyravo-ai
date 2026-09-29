import Link from "next/link";
import { getBrandNestMetrics, getRevenueSplit } from "@/lib/brandnest/metrics";
import { SearchBox, AddClientForm, ScoreAllButton } from "./BrandNestActions";

export const dynamic = "force-dynamic";

const inr = (v: number) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const fmtD = (d: any) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-xs uppercase tracking-wider text-grey-dark">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub && <div className="text-xs text-grey-dark">{sub}</div>}
    </div>
  );
}

export default async function BrandNestDashboard() {
  const [m, rev] = await Promise.all([getBrandNestMetrics(), getRevenueSplit()]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">🎨 BrandNest Studio</h1>
          <p className="mt-1 text-sm text-grey">Legacy business / client assets — historical design clients, projects &amp; revenue. Vyravo pipeline untouched.</p>
        </div>
        <Link href="/admin/brandnest/clients" className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary">
          All clients →
        </Link>
      </div>

      {/* Revenue separation — always explicit */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-white">Revenue (separated)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Card label="Vyravo revenue" value={inr(rev.vyravo)} sub="Vyravo invoices paid" />
          <Card label="BrandNest revenue" value={inr(rev.brandnest)} sub="BrandNest projects paid" />
          <Card label="Combined business revenue" value={inr(rev.combined)} sub="explicit sum — never mixed" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-white">Clients &amp; projects</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Historical clients" value={String(m.clients.total)} />
          <Card label="Active clients" value={String(m.clients.active)} />
          <Card label="Inactive clients" value={String(m.clients.inactive)} />
          <Card label="Repeat clients" value={String(m.clients.repeat)} />
          <Card label="Revenue this month" value={inr(m.revenue.month)} />
          <Card label="Revenue this year" value={inr(m.revenue.year)} />
          <Card label="Projects / avg value" value={`${m.revenue.projects} / ${inr(m.revenue.avgValue)}`} />
          <Card label="Last payment" value={fmtD(m.revenue.lastPayment)} />
          <Card label="Repeat-work potential" value={String(m.repeatPotential)} />
          <Card label="Vyravo-fit clients" value={String(m.vyravoFit)} />
          <Card label="Converted to Vyravo" value={String(m.clients.converted)} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-white">Global CRM search</h2>
          <div className="mt-3"><SearchBox /></div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-white">Add BrandNest client</h2>
          <div className="mt-3"><AddClientForm /></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Top opportunities (repeat + Vyravo-fit)</h2>
            <ScoreAllButton />
          </div>
          <div className="mt-3 space-y-2">
            {m.topOpportunities.length === 0 && <p className="text-sm text-grey">No flagged opportunities yet.</p>}
            {m.topOpportunities.map((o: any) => (
              <Link key={o.id} href={`/admin/brandnest/clients/${o.id}`} className="block rounded-lg border border-border bg-surface-2 p-3 hover:border-primary/40">
                <div className="text-sm font-medium text-white">{o.business_name || o.full_name}</div>
                <div className="text-xs text-grey">Vyravo: <b className="text-amber-400">{o.vyravo_opportunity}</b> · spent {inr(o.spent)}{o.repeat_value ? ` · repeat potential ${inr(o.repeat_value)}` : ""}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-white">Recent projects</h2>
          <div className="mt-3 space-y-2">
            {m.recentProjects.length === 0 && <p className="text-sm text-grey">No projects recorded. Only record real transactions — never fabricate.</p>}
            {m.recentProjects.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                <span className="font-medium text-white">{p.service}</span>
                <span className="text-grey"> — {p.currency} {p.amount} · {p.status} · {p.business_name || p.full_name || ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

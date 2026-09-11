import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc, eq, or, isNull, count } from "drizzle-orm";
import { ensureContactPriorityColumn } from "@/lib/leads/quality";
import { normalizeCity } from "@/lib/leads/city";

export const dynamic = "force-dynamic";

const scoreColor = (s: number) =>
  s >= 90 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s >= 75 ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : s >= 60 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default async function CrmLeadsPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  await ensureContactPriorityColumn(); // Lead Data Quality Rule
  // City-wise view: ?city=Pune filters to one city, ?city=__unknown shows rows with no city yet
  const sp = await searchParams;
  const cityFilter = (sp?.city || "").trim();
  const cityCounts = await db.select({ city: leads.city, n: count() }).from(leads).groupBy(leads.city);
  const byCity = new Map<string, number>();
  let unknownCity = 0, totalLeads = 0;
  for (const c of cityCounts) {
    totalLeads += c.n;
    const norm = normalizeCity(c.city);
    if (!norm) { unknownCity += c.n; continue; }
    byCity.set(norm, (byCity.get(norm) || 0) + c.n);
  }
  const cityList = [...byCity.entries()].sort((a, b) => b[1] - a[1]);
  const rows = cityFilter === "__unknown"
    ? await db.select().from(leads).where(or(isNull(leads.city), eq(leads.city, ""))).orderBy(desc(leads.createdAt)).limit(150)
    : cityFilter
      ? await db.select().from(leads).where(eq(leads.city, cityFilter)).orderBy(desc(leads.createdAt)).limit(150)
      : await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(150);
  const byStage = new Map<string, number>();
  rows.forEach((r) => byStage.set(r.stage || "new", (byStage.get(r.stage || "new") || 0) + 1));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">CRM — Real Leads</h1>
          <p className="mt-1 text-sm text-grey">Every real lead (engine + website), newest first. Never shown on public demos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...byStage.entries()].map(([stage, n]) => (
            <span key={stage} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-grey">
              {stage}: <span className="font-semibold text-white">{n}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/admin/crm/leads" className={`rounded-full border px-3 py-1 text-xs font-semibold ${!cityFilter ? "border-primary/50 bg-primary/10 text-white" : "border-border bg-surface text-grey hover:text-white"}`}>
          All ({totalLeads})
        </a>
        {cityList.map(([city, n]) => (
          <a key={city} href={`/admin/crm/leads?city=${encodeURIComponent(city)}`} className={`rounded-full border px-3 py-1 text-xs font-semibold ${city === cityFilter ? "border-primary/50 bg-primary/10 text-white" : "border-border bg-surface text-grey hover:text-white"}`}>
            {city} ({n})
          </a>
        ))}
        {unknownCity > 0 && (
          <a href="/admin/crm/leads?city=__unknown" className={`rounded-full border px-3 py-1 text-xs font-semibold ${cityFilter === "__unknown" ? "border-primary/50 bg-primary/10 text-white" : "border-border bg-surface text-grey hover:text-white"}`}>
            Unknown ({unknownCity})
          </a>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
              <th className="p-3">Lead</th><th className="p-3">Contact</th><th className="p-3">Score</th><th className="p-3">City</th>
              <th className="p-3">Stage</th><th className="p-3">Source</th><th className="p-3">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-grey">No leads yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="p-3">
                  <div className="font-medium text-white">{r.fullName}</div>
                  {r.businessWebsite && (
                    <a className="text-xs text-primary hover:underline" href={r.businessWebsite} target="_blank" rel="noreferrer">
                      {r.businessWebsite.replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  )}
                </td>
                <td className="p-3 text-grey">
                  {r.email ? <div>✉ {r.email}</div> : <div className="text-grey-dark">✉ —</div>}
                  {r.phone ? <div>☎ {r.phone}</div> : null}
                </td>
                <td className="p-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(r.leadScore ?? 0)}`}>{r.leadScore ?? 0}</span>
                </td>
                <td className="p-3 text-grey">{normalizeCity(r.city) || "—"}</td>
                <td className="p-3"><span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs text-grey">{r.stage || "new"}</span></td>
                <td className="p-3 text-grey">{r.source || "website"}</td>
                <td className="p-3 text-grey-dark">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

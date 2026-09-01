import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";

export const dynamic = "force-dynamic";

const scoreColor = (s: number) =>
  s >= 90 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s >= 75 ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : s >= 60 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default async function AdminLeadsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  const rows = await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(120);
  const engine = rows.filter((r) => r.source === "lead_engine");
  const other = rows.filter((r) => r.source !== "lead_engine");

  const Table = ({ items }: { items: typeof rows }) => (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-grey-dark">
            <th className="p-3">Lead</th>
            <th className="p-3">Contact</th>
            <th className="p-3">Industry</th>
            <th className="p-3">Score</th>
            <th className="p-3">Stage</th>
            <th className="p-3">Source</th>
            <th className="p-3">Added</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0">
              <td className="p-3">
                <div className="font-medium text-white">{r.fullName}</div>
                {r.businessName && r.businessName !== r.fullName && (
                  <div className="text-xs text-grey">{r.businessName}</div>
                )}
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
              <td className="p-3 text-grey">{r.industry || "—"}</td>
              <td className="p-3">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(r.leadScore ?? 0)}`}>
                  {r.leadScore ?? 0}
                </span>
                {r.leadCategory && <div className="mt-1 text-xs text-grey-dark">{r.leadCategory}</div>}
              </td>
              <td className="p-3 text-grey">{r.stage || "new"}</td>
              <td className="p-3 text-grey">{r.source || "website"}</td>
              <td className="p-3 text-grey-dark">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-white">Daily Leads</h1>
          <p className="mt-1 text-sm text-grey">
            Pushed automatically by the lead engine (Supabase → CRM pipeline) at 09:30 IST.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-2 text-center">
          <div className="text-2xl font-semibold text-white">{rows.length}</div>
          <div className="text-xs text-grey-dark uppercase">total</div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-grey">
          🎯 Engine leads ({engine.length})
        </h2>
        {engine.length ? <Table items={engine} /> : (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-grey">
            No engine-pushed leads yet — the next daily run (or the manual Actions trigger) will push them here.
          </div>
        )}
      </section>

      {other.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-grey">
            🌐 Website / other sources ({other.length})
          </h2>
          <Table items={other} />
        </section>
      )}
    </div>
  );
}

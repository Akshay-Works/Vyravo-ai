import { redirect } from "next/navigation";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { ensureLinkedInSchema } from "@/lib/linkedin/pipeline";
import { ensureContactPriorityColumn } from "@/lib/leads/quality";
import { ensureWhatsAppSchema } from "@/lib/whatsapp/pipeline";

export const dynamic = "force-dynamic";

const liStatusColor = (s: string | null) =>
  s === "sent" || s === "replied" ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s === "awaiting_approval" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : s === "queued" || s === "approved" ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
  : s === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30"
  : s === "not_eligible" ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
  : s ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

// Lead Data Quality Rule — contactability chip (P1..P4; old rows without the
// column are recomputed inline so history still shows a honest label).
const prioColor = (p: number) =>
  p === 1 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : p === 2 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
  : p === 3 ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
  : p === 4 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

const prioOf = (r: { contactPriority?: number | null; email?: string | null; phone?: string | null; businessWebsite?: string | null; linkedinUrl?: string | null; }) => {
  if (r.contactPriority != null && r.contactPriority > 0) return r.contactPriority;
  const hasEmail = !!r.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email);
  const hasPhone = !!r.phone && r.phone.replace(/\D/g, "").length >= 8;
  const hasSite = !!r.businessWebsite;
  const hasLi = !!r.linkedinUrl;
  if (hasEmail && hasPhone) return hasSite && hasLi ? 1 : 2;
  if (hasEmail) return 3;
  if (hasPhone) return 4;
  return 0;
};

const scoreColor = (s: number) =>
  s >= 90 ? "bg-green-500/15 text-green-400 border-green-500/30"
  : s >= 75 ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
  : s >= 60 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
  : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export default async function AdminLeadsPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  await ensureLinkedInSchema();
  await ensureWhatsAppSchema();
  await ensureContactPriorityColumn(); // Lead Data Quality Rule — column for P1-P4
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
            <th className="p-3">Q</th>
            <th className="p-3">Stage</th>
            <th className="p-3">LinkedIn</th>
            <th className="p-3">WhatsApp</th>
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
              <td className="p-3">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${prioColor(prioOf(r))}`}>
                  {prioOf(r) > 0 ? `P${prioOf(r)}` : "—"}
                </span>
              </td>
              <td className="p-3 text-grey">{r.stage || "new"}</td>
              <td className="p-3">
                {r.linkedinStatus ? (
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${liStatusColor(r.linkedinStatus)}`}>
                    {r.linkedinStatus.replace("_", " ")}
                  </span>
                ) : (
                  <span className="text-grey-dark">—</span>
                )}
                {r.linkedinUrl && (
                  <a href={`https://${String(r.linkedinUrl).replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="block text-[10px] text-primary hover:underline mt-0.5">
                    profile ↗
                  </a>
                )}
              </td>
              <td className="p-3">
                {r.whatsappOptInStatus === "opted_out" ? (
                  <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium bg-red-500/15 text-red-400 border-red-500/30">OPTED OUT</span>
                ) : r.whatsappOutreachStatus ? (
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    ["sent","delivered","read","replied"].includes(r.whatsappOutreachStatus) ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : r.whatsappOutreachStatus === "awaiting_approval" ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : r.whatsappOutreachStatus === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30"
                    : r.whatsappOutreachStatus === "not_eligible" ? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                    : "bg-violet-500/15 text-violet-400 border-violet-500/30"}`}>
                    {r.whatsappOutreachStatus.replace("_", " ")}
                  </span>
                ) : r.whatsappOptInStatus === "opted_in" ? (
                  <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium bg-green-500/15 text-green-400 border-green-500/30">OPTED IN</span>
                ) : (
                  <span className="text-grey-dark">—</span>
                )}
                {r.whatsappNumber && (
                  <div className="text-[10px] text-grey mt-0.5">{r.whatsappNumber.slice(0, 4)}****{r.whatsappNumber.slice(-3)}</div>
                )}
              </td>
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

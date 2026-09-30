import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getCallQueue } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export default async function SalesCalls() {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const q = await getCallQueue(user);
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">📞 Call queue</h1>
      <h2 className="text-sm font-semibold text-grey">Scheduled calls ({q.tasks.length})</h2>
      <div className="space-y-2">
        {q.tasks.map((t: any) => (
          <Link key={t.id} href={`/sales/leads/${t.lead_id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary/50">
            <span className="text-lg">📞</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.business_name || t.full_name}</div>
              <div className="text-xs text-grey">{t.phone || "no phone"} · score {t.lead_score ?? "–"}</div>
            </div>
            <span className="text-xs text-grey">{t.due_at ? new Date(t.due_at).toLocaleDateString("en-IN") : ""}</span>
          </Link>
        ))}
        {q.tasks.length === 0 && <p className="text-sm text-grey">No scheduled calls.</p>}
      </div>
      <h2 className="text-sm font-semibold text-grey">Suggested — contacted, silent, has phone ({q.suggested.length})</h2>
      <div className="space-y-2">
        {q.suggested.map((l: any) => (
          <Link key={l.id} href={`/sales/leads/${l.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary/50">
            <span className="text-lg">💡</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{l.business_name || l.full_name}</div>
              <div className="text-xs text-grey">{l.phone} · score {l.lead_score ?? "–"}</div>
            </div>
          </Link>
        ))}
        {q.suggested.length === 0 && <p className="text-sm text-grey">No suggestions right now.</p>}
      </div>
    </div>
  );
}

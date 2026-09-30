import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSalesMeetings } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export default async function SalesMeetings() {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const ms = await getSalesMeetings(user);
  const upcoming = ms.filter((m: any) => m.scheduled_at && new Date(m.scheduled_at) >= new Date());
  const past = ms.filter((m: any) => !m.scheduled_at || new Date(m.scheduled_at) < new Date()).slice(0, 30);
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">📅 Meetings</h1>
      <h2 className="text-sm font-semibold text-grey">Upcoming ({upcoming.length})</h2>
      <div className="space-y-2">
        {upcoming.map((m: any) => (
          <Link key={m.id} href={`/sales/leads/${m.lead_id}`} className="block rounded-xl border border-emerald-500/30 bg-surface p-3">
            <div className="text-sm font-semibold">{m.business_name || m.full_name}</div>
            <div className="text-xs text-grey">{new Date(m.scheduled_at).toLocaleString("en-IN")} · {m.status || "scheduled"}</div>
          </Link>
        ))}
        {upcoming.length === 0 && <p className="text-sm text-grey">No upcoming meetings.</p>}
      </div>
      <h2 className="text-sm font-semibold text-grey">Past</h2>
      <div className="space-y-2 opacity-70">
        {past.map((m: any) => (
          <div key={m.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
            <span className="font-semibold">{m.business_name || m.full_name}</span>
            <span className="ml-2 text-xs text-grey">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString("en-IN") : ""} · {m.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

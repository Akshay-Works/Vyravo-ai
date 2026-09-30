import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSalesPerformance, getTeamPerformance } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
      <span className="text-grey">{k}</span><span className="font-bold">{v}</span>
    </div>
  );
}

export default async function SalesPerformance({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const sp = await searchParams;
  const viewId = user.role === "admin" && sp.userId ? Number(sp.userId) : user.id;
  const mine = await getSalesPerformance(user, viewId);
  const team = user.role === "admin" ? await getTeamPerformance() : [];
  const pos = mine.calls.positive || 0, total = mine.calls.n || 0;
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">🏆 Performance</h1>
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">{viewId === user.id ? "My numbers" : `Numbers for user #${viewId}`}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Row k="Calls logged" v={total} />
          <Row k="Positive calls" v={`${pos}${total ? ` (${Math.round(100 * pos / total)}%)` : ""}`} />
          <Row k="Tasks done" v={mine.tasks.done || 0} />
          <Row k="Tasks overdue" v={mine.tasks.overdue || 0} />
          <Row k="Leads assigned" v={mine.leads.assigned || 0} />
          <Row k="Qualified" v={mine.leads.qualified || 0} />
          <Row k="In proposal/negotiation" v={mine.leads.proposals || 0} />
          <Row k="Won" v={mine.leads.won || 0} />
          <Row k="Meetings" v={mine.meetings || 0} />
          <Row k="Revenue" v={`₹${Number(mine.leads.revenue || 0).toLocaleString("en-IN")}`} />
        </div>
      </div>
      {user.role === "admin" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold">Team leaderboard</h2>
          <div className="space-y-2">
            {team.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
                <div className="font-semibold">{t.name} <span className="font-normal text-grey-dark">({t.email})</span></div>
                <div className="mt-1 text-grey">
                  📞 {t.calls?.n || 0} calls · ✅ {t.tasks?.done || 0} tasks · 👥 {t.leads?.assigned || 0} leads · 🏆 {t.leads?.won || 0} won · 💰 ₹{Number(t.leads?.revenue || 0).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
            {team.length === 0 && <p className="text-xs text-grey">No sales users yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

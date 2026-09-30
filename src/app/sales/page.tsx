import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSalesOverview, listTasks } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

function Card({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-grey">{label}</div>
      <div className="mt-1 font-[var(--font-heading)] text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-grey-dark">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function SalesOverview() {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const [ov, tasks] = await Promise.all([getSalesOverview(user), listTasks(user)]);
  const due = tasks.filter((t) => t.status === "open").slice(0, 8);
  return (
    <div className="space-y-6">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">Good day, {user.name.split(" ")[0]} 👋</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="My leads" value={ov.leads.total ?? 0} sub={`${ov.leads.new ?? 0} new`} href="/sales/leads" />
        <Card label="Follow-ups due" value={ov.tasks.due_today ?? 0} sub={`${ov.tasks.overdue ?? 0} overdue`} href="/sales/tasks" />
        <Card label="Calls today" value={ov.callsToday} href="/sales/calls" />
        <Card label="Revenue (won)" value={`₹${Number(ov.leads.revenue || 0).toLocaleString("en-IN")}`} sub={`${ov.conversion}% conversion`} href="/sales/performance" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card label="Replied" value={ov.leads.replied ?? 0} href="/sales/leads" />
        <Card label="Qualified" value={ov.leads.qualified ?? 0} href="/sales/leads?stage=qualified" />
        <Card label="Meetings" value={ov.leads.meetings ?? 0} href="/sales/meetings" />
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">⏰ Up next</h2>
          <Link href="/sales/tasks" className="text-xs text-primary">All follow-ups →</Link>
        </div>
        {due.length === 0 && <p className="text-sm text-grey">Nothing due. Queue is clear 🎉</p>}
        <div className="space-y-2">
          {due.map((t) => (
            <Link key={t.id} href={`/sales/leads/${t.lead_id}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2.5 text-sm">
              <span>{t.kind === "call" ? "📞" : t.kind === "meeting_prep" ? "📅" : "📌"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{t.business_name || t.full_name}</span>
              <span className={`text-xs ${t.due_at && new Date(t.due_at) < new Date() ? "font-bold text-red-400" : "text-grey"}`}>
                {t.due_at ? new Date(t.due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "no date"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { listTasks } from "@/lib/sales-workspace/ops";
import TaskDoneButton from "@/components/TaskDoneButton";

export const dynamic = "force-dynamic";

export default async function SalesTasks() {
  const user = await getCurrentUser();
  if (!user || user.role === "social") redirect("/login");
  const tasks = await listTasks(user);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status !== "open").slice(0, 20);
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">📌 Follow-ups ({open.length} open)</h1>
      <div className="space-y-2">
        {open.map((t) => {
          const overdue = t.due_at && new Date(t.due_at) < new Date();
          return (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl border p-3 ${overdue ? "border-red-500/50 bg-surface" : "border-border bg-surface"}`}>
              <span>{t.kind === "call" ? "📞" : t.kind === "meeting_prep" ? "📅" : "📌"}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/sales/leads/${t.lead_id}`} className="text-sm font-semibold hover:text-primary">
                  {t.business_name || t.full_name}
                </Link>
                <p className="text-xs text-grey">{t.title}{t.owner_name && user.role === "admin" ? ` · 👤 ${t.owner_name}` : ""}</p>
              </div>
              <span className={`text-xs ${overdue ? "font-bold text-red-400" : "text-grey"}`}>
                {t.due_at ? new Date(t.due_at).toLocaleString("en-IN") : "no date"}
              </span>
              <TaskDoneButton leadId={t.lead_id} taskId={t.id} />
            </div>
          );
        })}
        {open.length === 0 && <p className="text-sm text-grey">All clear 🎉</p>}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-grey">Recently done</h2>
          <div className="space-y-1 opacity-60">
            {done.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2 text-xs text-grey">
                <span>✅</span><span className="flex-1 truncate">{t.title} — {t.business_name || t.full_name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

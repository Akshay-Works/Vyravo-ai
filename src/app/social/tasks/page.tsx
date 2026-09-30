import { redirect } from "next/navigation";
import { getCurrentUser, listEmployees } from "@/lib/auth/rbac";
import { listContentTasks } from "@/lib/social-workspace/ops";
import SocialTaskActions from "@/components/SocialTaskActions";

export const dynamic = "force-dynamic";

export default async function SocialTasks() {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const tasks = await listContentTasks(user);
  const socialUsers = user.role === "admin" ? (await listEmployees()).filter((e: any) => e.workspace_role === "social" && e.is_active) : [];
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done").slice(0, 20);
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">✅ Tasks ({open.length} open)</h1>
      {user.role === "admin" && <SocialTaskActions mode="create" socialUsers={socialUsers} />}
      <div className="space-y-2">
        {open.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <p className="truncate text-xs text-grey">{t.description}</p>}
              <p className="text-[11px] text-grey-dark">
                {[t.platform, t.recurrence ? `🔁 ${t.recurrence}` : "", t.assignee_name ? `👤 ${t.assignee_name}` : "",
                  t.due_at ? new Date(t.due_at).toLocaleString("en-IN") : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
            <SocialTaskActions mode="done" taskId={t.id} />
          </div>
        ))}
        {open.length === 0 && <p className="text-sm text-grey">All done 🎉</p>}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-grey">Recently done</h2>
          <div className="space-y-1 opacity-60">
            {done.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-surface p-2 text-xs text-grey">✅ {t.title}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

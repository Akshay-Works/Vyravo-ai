import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSocialOverview, listPosts, listContentTasks } from "@/lib/social-workspace/ops";

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

export default async function SocialOverview() {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const [ov, posts, tasks] = await Promise.all([getSocialOverview(user), listPosts(user), listContentTasks(user)]);
  const pending = posts.filter((p) => p.status === "pending_approval").slice(0, 5);
  const open = tasks.filter((t) => t.status !== "done").slice(0, 6);
  const followers = ov.metrics.reduce((s: number, m: any) => s + Number(m.followers || 0), 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-heading)] text-xl font-bold">Hello, {user.name.split(" ")[0]} 🎨</h1>
        <Link href="/social/create" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">+ New post</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total posts" value={ov.posts.total ?? 0} href="/social/calendar" />
        <Card label="Awaiting approval" value={ov.posts.pending ?? 0} href="/social/calendar?status=pending_approval" />
        <Card label="Published" value={ov.posts.published ?? 0} href="/social/calendar?status=published" />
        <Card label="Open tasks" value={ov.tasks.open ?? 0} sub={`${ov.tasks.overdue ?? 0} overdue`} href="/social/tasks" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">⏳ Awaiting approval</h2>
            <Link href="/social/calendar" className="text-xs text-primary">Calendar →</Link>
          </div>
          {pending.length === 0 && <p className="text-xs text-grey">Nothing waiting.</p>}
          {pending.map((p) => (
            <Link key={p.id} href={`/social/create?id=${p.id}`} className="mb-2 block rounded-lg border border-border bg-surface-2 p-2 text-xs">
              <span className="font-semibold capitalize">{p.platform} · {p.content_type}</span>
              <p className="truncate text-grey">{p.caption || "(no caption)"}</p>
            </Link>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">✅ My tasks</h2>
            <Link href="/social/tasks" className="text-xs text-primary">All tasks →</Link>
          </div>
          {open.length === 0 && <p className="text-xs text-grey">No open tasks 🎉</p>}
          {open.map((t) => (
            <div key={t.id} className="mb-2 rounded-lg border border-border bg-surface-2 p-2 text-xs">
              <span className="font-semibold">{t.title}</span>
              <span className="ml-2 text-grey-dark">{t.due_at ? new Date(t.due_at).toLocaleDateString("en-IN") : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">📈 Total followers: {followers.toLocaleString("en-IN")}</h2>
          <Link href="/social/analytics" className="text-xs text-primary">Analytics →</Link>
        </div>
      </div>
    </div>
  );
}

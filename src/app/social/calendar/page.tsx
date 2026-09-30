import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { listPosts } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-2 text-grey", review: "bg-blue-500/15 text-blue-400",
  pending_approval: "bg-amber-500/15 text-amber-400", approved: "bg-emerald-500/15 text-emerald-400",
  scheduled: "bg-violet-500/15 text-violet-400", published: "bg-primary/15 text-primary", archived: "opacity-50 text-grey",
};

export default async function SocialCalendar({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const sp = await searchParams;
  const posts = await listPosts(user, { status: sp.status });
  const groups: Record<string, any[]> = {};
  for (const p of posts) {
    const key = p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Unscheduled";
    (groups[key] ||= []).push(p);
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-heading)] text-xl font-bold">🗓️ Content calendar ({posts.length})</h1>
        <Link href="/social/create" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold">+ New</Link>
      </div>
      <form method="get" className="flex gap-2">
        <select name="status" defaultValue={sp.status || ""}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-white">
          <option value="">All statuses</option>
          {["draft", "review", "pending_approval", "approved", "scheduled", "published", "archived"].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button className="rounded-lg bg-surface-2 px-4 py-2 text-sm">Filter</button>
      </form>
      {Object.entries(groups).map(([day, items]) => (
        <div key={day}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-grey">{day}</h2>
          <div className="space-y-2">
            {items.map((p) => (
              <Link key={p.id} href={`/social/create?id=${p.id}`}
                className="block rounded-xl border border-border bg-surface p-3 hover:border-primary/50">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold capitalize">📱 {p.platform} · {p.content_type}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[p.status] || ""}`}>
                    {p.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-grey">{p.caption || "(no caption)"}</p>
                {user.role === "admin" && p.author_name && <p className="mt-1 text-[11px] text-grey-dark">by {p.author_name}</p>}
              </Link>
            ))}
          </div>
        </div>
      ))}
      {posts.length === 0 && <p className="text-sm text-grey">No posts yet — create your first one.</p>}
    </div>
  );
}

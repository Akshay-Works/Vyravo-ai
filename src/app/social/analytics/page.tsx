import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSocialAnalytics } from "@/lib/social-workspace/ops";
import MetricsForm from "@/components/MetricsForm";

export const dynamic = "force-dynamic";

export default async function SocialAnalytics() {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const a = await getSocialAnalytics();
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">📈 Analytics</h1>
      {user.role === "admin" && <MetricsForm />}
      <div className="grid gap-3 md:grid-cols-2">
        {a.byPlatform.map((p: any) => (
          <div key={p.platform} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-bold capitalize">📱 {p.platform}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Followers</div><div className="font-bold">{Number(p.followers || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Reach (30d)</div><div className="font-bold">{Number(p.reach_30 || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Engagement (30d)</div><div className="font-bold">{Number(p.eng_30 || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Posts (30d)</div><div className="font-bold">{p.posts_30 || 0}</div></div>
            </div>
          </div>
        ))}
        {a.byPlatform.length === 0 && <p className="text-sm text-grey">No metrics yet — admin records follower/reach numbers here weekly.</p>}
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Content funnel</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {a.funnel.map((f: any) => (
            <span key={f.status} className="rounded-full bg-surface-2 px-3 py-1">{f.status.replace(/_/g, " ")}: <b>{f.n}</b></span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Recently published</h2>
        {a.recentPublished.map((p: any) => (
          <div key={p.id} className="mb-2 rounded-lg border border-border bg-surface-2 p-2 text-xs">
            <span className="font-semibold capitalize">{p.platform} · {p.content_type}</span>
            <span className="ml-2 text-grey-dark">{p.published_at ? new Date(p.published_at).toLocaleDateString("en-IN") : ""}</span>
            <p className="truncate text-grey">{p.caption}</p>
          </div>
        ))}
        {a.recentPublished.length === 0 && <p className="text-xs text-grey">Nothing published yet.</p>}
      </div>
    </div>
  );
}

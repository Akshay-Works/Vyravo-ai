import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getSocialAnalytics } from "@/lib/social-workspace/ops";
import MetricsForm from "@/components/MetricsForm";

export const dynamic = "force-dynamic";

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function delta(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v > 0) return `+${v.toLocaleString("en-IN")}`;
  if (v < 0) return v.toLocaleString("en-IN");
  return "0";
}

export default async function SocialAnalytics() {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const a = await getSocialAnalytics();
  const canEdit = user.role === "admin" || user.role === "social";
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">📈 Analytics</h1>
      <p className="text-xs text-grey">
        Live page stats. LinkedIn / Instagram / etc. cannot auto-sync follower counts without each platform’s official partner API.
        You or admin paste the numbers anytime — every save is timestamped so growth is tracked.
      </p>
      {canEdit && <MetricsForm latest={a.byPlatform} />}
      <div className="grid gap-3 md:grid-cols-2">
        {a.byPlatform.map((p: any) => (
          <div key={p.platform} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold capitalize">📱 {p.platform}</div>
              <span className={`text-xs font-semibold ${Number(p.delta_followers) > 0 ? "text-emerald-400" : Number(p.delta_followers) < 0 ? "text-red-400" : "text-grey"}`}>
                {p.delta_followers == null ? "first snapshot" : `${delta(p.delta_followers)} vs last day`}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Followers</div><div className="font-bold">{Number(p.followers || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Reach (30d sum)</div><div className="font-bold">{Number(p.reach_30 || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Engagement (30d)</div><div className="font-bold">{Number(p.eng_30 || 0).toLocaleString("en-IN")}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-grey">Posts (30d)</div><div className="font-bold">{p.posts_30 || 0}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-grey">
              Updated {p.recorded_at ? fmtWhen(p.recorded_at) : fmtWhen(p.date)}
              {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ""}
              {p.notes ? ` · ${p.notes}` : ""}
            </div>
          </div>
        ))}
        {a.byPlatform.length === 0 && <p className="text-sm text-grey">No metrics yet — save a snapshot above (LinkedIn followers is the usual first one).</p>}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">⏱ Update history (IST)</h2>
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="sticky top-0 bg-surface text-[11px] uppercase text-grey-dark">
              <tr>
                <th className="py-2 pr-2">When</th>
                <th className="py-2 pr-2">Platform</th>
                <th className="py-2 pr-2">Followers</th>
                <th className="py-2 pr-2">Δ</th>
                <th className="py-2 pr-2">By</th>
                <th className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {(a.history || []).map((h: any) => (
                <tr key={h.id} className="border-t border-border">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{fmtWhen(h.recorded_at)}</td>
                  <td className="py-1.5 pr-2 capitalize">{h.platform}</td>
                  <td className="py-1.5 pr-2 font-semibold">{h.followers == null ? "—" : Number(h.followers).toLocaleString("en-IN")}</td>
                  <td className={`py-1.5 pr-2 ${Number(h.delta_followers) > 0 ? "text-emerald-400" : Number(h.delta_followers) < 0 ? "text-red-400" : "text-grey"}`}>{delta(h.delta_followers)}</td>
                  <td className="py-1.5 pr-2">{h.recorded_by_name || "—"}</td>
                  <td className="py-1.5 text-grey">{h.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!a.history || a.history.length === 0) && <p className="py-4 text-center text-grey">History appears after the first save.</p>}
        </div>
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

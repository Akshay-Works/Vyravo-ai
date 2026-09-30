import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { listAssets } from "@/lib/social-workspace/ops";
import AssetForm from "@/components/AssetForm";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = { logo: "🖼️", guideline: "📖", template: "📝", creative: "🎨", info: "ℹ️" };

export default async function SocialAssets() {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const assets = await listAssets();
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">🎨 Brand assets & resources</h1>
      {user.role === "admin" && <AssetForm />}
      <div className="grid gap-3 md:grid-cols-2">
        {assets.map((a) => (
          <div key={a.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="text-sm font-semibold">{KIND_ICON[a.kind] || "📦"} {a.name}</div>
            <div className="mt-1 text-[11px] uppercase text-grey-dark">{a.kind}</div>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-grey">{a.body}</p>
          </div>
        ))}
        {assets.length === 0 && <p className="text-sm text-grey">No assets yet — admin adds brand files, guidelines and links here.</p>}
      </div>
    </div>
  );
}

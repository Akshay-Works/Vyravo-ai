import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { listAssets } from "@/lib/social-workspace/ops";
import AssetForm from "@/components/AssetForm";
import AssetCard from "@/components/AssetCard";

export const dynamic = "force-dynamic";

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
          <AssetCard key={a.id} asset={a} admin={user.role === "admin"} />
        ))}
        {assets.length === 0 && <p className="text-sm text-grey">No assets yet — admin adds brand files, guidelines and links here.</p>}
      </div>
    </div>
  );
}

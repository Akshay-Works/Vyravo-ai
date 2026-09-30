import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import { getPost } from "@/lib/social-workspace/ops";
import SocialPostForm from "@/components/SocialPostForm";

export const dynamic = "force-dynamic";

export default async function SocialCreate({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "sales") redirect("/login");
  const sp = await searchParams;
  const post = sp.id ? await getPost(user, Number(sp.id)) : null;
  if (sp.id && !post) redirect("/social/calendar");
  return (
    <div className="space-y-4">
      <h1 className="font-[var(--font-heading)] text-xl font-bold">{post ? "✏️ Edit post" : "✍️ New post"}</h1>
      <SocialPostForm post={post} admin={user.role === "admin"} />
    </div>
  );
}

import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { listPosts, createPost } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  return Response.json({ ok: true, admin: auth.user.role === "admin",
    posts: await listPosts(auth.user, {
      status: u.searchParams.get("status") || undefined,
      platform: u.searchParams.get("platform") || undefined,
    }) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  try {
    const b = await request.json().catch(() => ({}));
    return Response.json({ ok: true, ...(await createPost(auth.user, {
      platform: b.platform, contentType: b.contentType, caption: b.caption,
      mediaUrls: Array.isArray(b.mediaUrls) ? b.mediaUrls : [], hashtags: b.hashtags,
      scheduledAt: b.scheduledAt || null, notes: b.notes,
    })) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

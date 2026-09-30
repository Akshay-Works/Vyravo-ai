import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { getPost, updatePost, transitionPost, deletePost } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const p = await getPost(auth.user, Number(id));
  if (!p) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, post: p, admin: auth.user.role === "admin" });
}

// PATCH { action: update|transition, ... } | DELETE
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const b = await request.json().catch(() => ({}));
  try {
    if (String(b.action) === "transition") {
      await transitionPost(auth.user, Number(id), String(b.to), b.note);
      return Response.json({ ok: true });
    }
    await updatePost(auth.user, Number(id), {
      platform: b.platform, contentType: b.contentType, caption: b.caption,
      mediaUrls: Array.isArray(b.mediaUrls) ? b.mediaUrls : undefined, hashtags: b.hashtags,
      scheduledAt: b.scheduledAt !== undefined ? b.scheduledAt : undefined, notes: b.notes,
      needsApproval: b.needsApproval,
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  try {
    await deletePost(auth.user, Number(id));
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

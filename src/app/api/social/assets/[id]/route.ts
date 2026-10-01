import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { updateAsset, deleteAsset } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) return Response.json({ error: "invalid id" }, { status: 400 });
  const b = await request.json().catch(() => ({}));
  try {
    await updateAsset(auth.user, nid, { name: b.name, kind: b.kind, body: b.body });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) return Response.json({ error: "invalid id" }, { status: 400 });
  try {
    await deleteAsset(auth.user, nid);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

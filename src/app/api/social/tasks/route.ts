import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { listContentTasks, createContentTask, completeContentTask } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  return Response.json({ ok: true, admin: auth.user.role === "admin", tasks: await listContentTasks(auth.user) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  const b = await request.json().catch(() => ({}));
  try {
    if (String(b.action) === "done") {
      await completeContentTask(auth.user, Number(b.id));
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, ...(await createContentTask(auth.user, b)) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

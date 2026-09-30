import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { getSalesPerformance, getTeamPerformance } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  try {
    const u = new URL(request.url);
    if (auth.user.role === "admin" && u.searchParams.get("team") === "1")
      return Response.json({ ok: true, team: await getTeamPerformance() });
    const userId = u.searchParams.get("userId") ? Number(u.searchParams.get("userId")) : undefined;
    return Response.json({ ok: true, ...(await getSalesPerformance(auth.user, userId)) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: e?.status || 400 });
  }
}

import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { listSalesLeads } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const u = new URL(request.url);
  const leads = await listSalesLeads(auth.user, {
    q: u.searchParams.get("q") || undefined,
    stage: u.searchParams.get("stage") || undefined,
  });
  return Response.json({ ok: true, leads, admin: auth.user.role === "admin" });
}

import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { getSalesOverview, getCallQueue } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const [overview, queue] = await Promise.all([getSalesOverview(auth.user), getCallQueue(auth.user)]);
  return Response.json({ ok: true, overview, queueCounts: { tasks: queue.tasks.length, suggested: queue.suggested.length } });
}

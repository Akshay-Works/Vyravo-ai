import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { listTasks, getCallQueue, getSalesMeetings } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

// GET ?view=tasks|calls|meetings
export async function GET(request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const view = new URL(request.url).searchParams.get("view") || "tasks";
  if (view === "calls") return Response.json({ ok: true, ...(await getCallQueue(auth.user)) });
  if (view === "meetings") return Response.json({ ok: true, meetings: await getSalesMeetings(auth.user) });
  return Response.json({ ok: true, tasks: await listTasks(auth.user) });
}

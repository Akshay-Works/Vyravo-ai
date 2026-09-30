import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { getSocialOverview } from "@/lib/social-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireRoles(["social"]);
  if (!auth.ok) return auth.res;
  return Response.json({ ok: true, ...(await getSocialOverview(auth.user)) });
}

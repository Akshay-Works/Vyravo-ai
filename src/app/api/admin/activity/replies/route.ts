import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { replyIntelligence, type Tier2Filters } from "@/lib/activity/tier2";

export const dynamic = "force-dynamic";

export function tier2Filters(q: URLSearchParams): Tier2Filters {
  const f: Tier2Filters = {};
  if (q.get("from")) f.from = q.get("from")!;
  if (q.get("to")) f.to = q.get("to")!;
  if (q.get("industry")) f.industry = q.get("industry")!;
  if (q.get("source")) f.source = q.get("source")!;
  if (q.get("country")) f.country = q.get("country")!;
  if (q.get("priority")) f.priority = q.get("priority")!;
  return f;
}

// GET /api/admin/activity/replies?from=&to=&industry=&source=&country=&priority=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await replyIntelligence(tier2Filters(new URL(request.url).searchParams)));
  } catch (e: any) {
    console.error("Tier2 replies error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

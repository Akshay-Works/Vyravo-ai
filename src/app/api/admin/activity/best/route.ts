import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { bestOutreach } from "@/lib/activity/tier2";
import { tier2Filters } from "../replies/route";

export const dynamic = "force-dynamic";

// GET /api/admin/activity/best?... (same filters)
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await bestOutreach(tier2Filters(new URL(request.url).searchParams)));
  } catch (e: any) {
    console.error("Tier2 best error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

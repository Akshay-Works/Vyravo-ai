import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getProposalAnalytics } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const analytics = await getProposalAnalytics();
    return Response.json(analytics);
  } catch (e) {
    console.error("Proposal analytics error:", e);
    return Response.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}

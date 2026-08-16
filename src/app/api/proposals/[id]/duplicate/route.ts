import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { duplicateProposal } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    const newId = await duplicateProposal(Number(id));
    if (!newId) return Response.json({ error: "Proposal not found" }, { status: 404 });
    return Response.json({ success: true, id: newId });
  } catch (e) {
    console.error("Duplicate proposal error:", e);
    return Response.json({ error: "Failed to duplicate proposal" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { addComment, getProposal } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]/comments
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const data = await getProposal(Number(id));
    return Response.json({ comments: data?.comments || [] });
  } catch {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/proposals/[id]/comments — add a team comment
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
    const body = await request.json();
    if (!body.content?.trim()) return Response.json({ error: "Comment is required" }, { status: 400 });
    await addComment(Number(id), body.content, { author: body.author || "Vyravo Admin", authorType: "team" });
    return Response.json({ success: true });
  } catch (e) {
    console.error("Add comment error:", e);
    return Response.json({ error: "Failed to add comment" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { getProposal, updateProposal, deleteProposal } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]
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
    if (!data) return Response.json({ error: "Proposal not found" }, { status: 404 });
    return Response.json(data);
  } catch (e) {
    console.error("Get proposal error:", e);
    return Response.json({ error: "Failed to load proposal" }, { status: 500 });
  }
}

// PATCH /api/proposals/[id]
export async function PATCH(
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
    const ok = await updateProposal(Number(id), body, body.changeNote || "Updated");
    if (!ok) return Response.json({ error: "Proposal not found" }, { status: 404 });
    return Response.json({ success: true });
  } catch (e) {
    console.error("Update proposal error:", e);
    return Response.json({ error: "Failed to update proposal" }, { status: 500 });
  }
}

// DELETE /api/proposals/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(_request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const { id } = await params;
    await deleteProposal(Number(id));
    return Response.json({ success: true });
  } catch (e) {
    console.error("Delete proposal error:", e);
    return Response.json({ error: "Failed to delete proposal" }, { status: 500 });
  }
}

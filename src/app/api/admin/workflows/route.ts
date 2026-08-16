import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { listWorkflowExecutions, retryWorkflow, retryFailedWorkflows } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

// GET /api/admin/workflows?status=&limit=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = Number(searchParams.get("limit") || "50");
    const workflows = await listWorkflowExecutions({ status, limit });
    return Response.json({ workflows });
  } catch (e) {
    console.error("Workflow list error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/admin/workflows — retry a failed workflow by id, or retry all
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
  try {
    const body = await request.json().catch(() => ({}));
    if (body.retryAll) {
      const n = await retryFailedWorkflows();
      return Response.json({ success: true, retried: n });
    }
    if (body.id) {
      const ok = await retryWorkflow(body.id);
      return Response.json({ success: ok });
    }
    return Response.json({ error: "id or retryAll required" }, { status: 400 });
  } catch (e) {
    console.error("Workflow retry error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

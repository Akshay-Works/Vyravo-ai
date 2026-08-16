import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { recordEvent } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposals/[id]/event — record an admin-side tracking event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    await recordEvent(Number(id), body.eventType || "event", body.metadata || {});
    return Response.json({ success: true });
  } catch (e) {
    console.error("Record event error:", e);
    return Response.json({ error: "Failed to record event" }, { status: 500 });
  }
}

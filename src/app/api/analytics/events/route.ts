import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { trackEvent } from "@/lib/analytics/events";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/analytics/events — track an event
export async function POST(request: NextRequest) {
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }
  // Events can be tracked without admin auth (for client-side tracking)
  try {
    const body = await request.json();
    const { eventType, ...data } = body;
    if (!eventType) return Response.json({ error: "eventType required" }, { status: 400 });
    await trackEvent(eventType, data);
    return Response.json({ success: true });
  } catch (e) {
    console.error("Event tracking error:", e);
    return Response.json({ error: "Failed to track event" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientNotifications, markNotificationRead } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const notifications = await getClientNotifications(session.userId);
    return Response.json({ notifications });
  } catch (e) {
    console.error("Portal notifications error:", e);
    return Response.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.id) await markNotificationRead(body.id);
    return Response.json({ success: true });
  } catch (e) {
    console.error("Portal mark notification error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

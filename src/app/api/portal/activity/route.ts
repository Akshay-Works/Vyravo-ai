import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientActivity } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const activity = await getClientActivity(session.clientId);
    return Response.json({ activity });
  } catch (e) {
    console.error("Portal activity error:", e);
    return Response.json({ error: "Failed to load activity" }, { status: 500 });
  }
}

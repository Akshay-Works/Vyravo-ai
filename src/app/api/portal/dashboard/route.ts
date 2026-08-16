import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getDashboard } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await getDashboard(session.clientId);
    return Response.json(data);
  } catch (e) {
    console.error("Portal dashboard error:", e);
    return Response.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

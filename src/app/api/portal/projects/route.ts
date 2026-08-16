import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientProjects, getClientProject } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const projects = await getClientProjects(session.clientId);
    return Response.json({ projects });
  } catch (e) {
    console.error("Portal projects error:", e);
    return Response.json({ error: "Failed to load projects" }, { status: 500 });
  }
}

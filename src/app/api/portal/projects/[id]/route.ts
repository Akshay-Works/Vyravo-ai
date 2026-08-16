import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientProject } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const project = await getClientProject(session.clientId, Number(id));
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ project });
  } catch (e) {
    console.error("Portal project error:", e);
    return Response.json({ error: "Failed to load project" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientProposals } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const proposals = await getClientProposals(session.clientId);
    return Response.json({ proposals });
  } catch (e) {
    console.error("Portal proposals error:", e);
    return Response.json({ error: "Failed to load proposals" }, { status: 500 });
  }
}

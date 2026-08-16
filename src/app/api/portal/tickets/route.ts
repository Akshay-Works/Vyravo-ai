import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientTickets, createTicket } from "@/lib/portal/engine";
import { emitEvent } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const tickets = await getClientTickets(session.clientId);
    return Response.json({ tickets });
  } catch (e) {
    console.error("Portal tickets error:", e);
    return Response.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.title?.trim()) return Response.json({ error: "Title is required" }, { status: 400 });
    const ticket = await createTicket({
      clientId: session.clientId,
      title: body.title,
      description: body.description || "",
      priority: body.priority,
      projectId: body.projectId ? Number(body.projectId) : undefined,
    });
    try { await emitEvent("support_ticket_created", { clientId: session.clientId, metadata: { title: body.title, ticketId: ticket.id } }); } catch {}
    return Response.json({ success: true, ticket }, { status: 201 });
  } catch (e) {
    console.error("Portal create ticket error:", e);
    return Response.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}

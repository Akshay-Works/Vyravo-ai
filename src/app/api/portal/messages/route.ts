import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientMessages, sendMessage, markMessagesRead } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ? Number(searchParams.get("projectId")) : undefined;
    const messages = await getClientMessages(session.clientId, projectId);
    return Response.json({ messages });
  } catch (e) {
    console.error("Portal messages error:", e);
    return Response.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.content?.trim()) return Response.json({ error: "Message content is required" }, { status: 400 });
    const msg = await sendMessage(session.clientId, body.content, {
      projectId: body.projectId ? Number(body.projectId) : undefined,
      senderName: session.name,
      senderUserId: session.userId,
    });
    return Response.json({ success: true, message: msg }, { status: 201 });
  } catch (e) {
    console.error("Portal send message error:", e);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    await markMessagesRead(session.clientId, body.projectId ? Number(body.projectId) : undefined);
    return Response.json({ success: true });
  } catch (e) {
    console.error("Portal mark read error:", e);
    return Response.json({ error: "Failed to mark read" }, { status: 500 });
  }
}

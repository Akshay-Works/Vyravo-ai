import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { isWhatsAppAdminAuthorized } from "@/lib/whatsapp/admin-auth";
import { getWhatsAppStore } from "@/lib/whatsapp/storage";
import type { WhatsAppConversationStatus } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function conversationIdFromParams(params: Promise<{ conversationId: string }>): Promise<string> {
  const value = (await params).conversationId;
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value).trim().slice(0, 128);
  } catch {
    return "";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  if (!isWhatsAppAdminAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conversationId = await conversationIdFromParams(params);
    if (!conversationId) return Response.json({ error: "Conversation ID is required" }, { status: 400 });
    const conversation = await getWhatsAppStore().getConversation(conversationId);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });
    return Response.json({ conversation });
  } catch (error) {
    console.error("WhatsApp conversation lookup failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
): Promise<Response> {
  if (!isWhatsAppAdminAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = rateLimit("write", clientIp(request));
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec);

  try {
    const conversationId = await conversationIdFromParams(params);
    if (!conversationId) return Response.json({ error: "Conversation ID is required" }, { status: 400 });
    const current = await getWhatsAppStore().getConversation(conversationId);
    if (!current) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status;
    if (status !== "AI_ACTIVE" && status !== "HUMAN_HANDOFF") {
      return Response.json(
        { error: "status must be AI_ACTIVE or HUMAN_HANDOFF" },
        { status: 400 }
      );
    }

    const nextStatus = status as WhatsAppConversationStatus;
    const nextQualificationState = nextStatus === "HUMAN_HANDOFF"
      ? "human_handoff"
      : current.leadInfo.qualified
        ? "qualified"
        : current.leadInfo.discoveryCallRequested
          ? "booking_requested"
          : "qualifying";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    const updated = await getWhatsAppStore().updateConversation(conversationId, {
      status: nextStatus,
      qualificationState: nextQualificationState,
      handoffReason: nextStatus === "HUMAN_HANDOFF" ? reason || "Marked for human assistance" : null,
      handoffNotificationStatus: nextStatus === "AI_ACTIVE" ? "not_attempted" : current.handoffNotificationStatus,
    });

    return Response.json({ success: true, conversation: updated });
  } catch (error) {
    console.error("WhatsApp conversation update failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return Response.json({ error: "Unable to update conversation" }, { status: 500 });
  }
}

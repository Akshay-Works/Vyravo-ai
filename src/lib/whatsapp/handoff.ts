// Human handoff for WhatsApp conversations.
//
// The existing Email Automation webhook is optional. When it is not configured,
// this module reports that no notification was sent; the chatbot never claims
// that a human has been notified when no notification channel exists.

import { triggerEmailAutomation } from "@/lib/voice/integrations";
import type { LeadInfo } from "@/lib/chatbot/types";
import type { WhatsAppConversation } from "./types";

export interface HumanHandoffResult {
  notificationConfigured: boolean;
  notified: boolean;
  detail: string;
}

export async function notifyWhatsAppHumanHandoff(input: {
  conversation: WhatsAppConversation;
  reason: string;
  recentMessages: { role: string; content: string }[];
}): Promise<HumanHandoffResult> {
  if (!process.env.EMAIL_AUTOMATION_WEBHOOK_URL?.trim()) {
    return {
      notificationConfigured: false,
      notified: false,
      detail: "No human handoff notification channel is configured",
    };
  }

  const payload = {
    conversationId: input.conversation.conversationId,
    channel: "whatsapp",
    phoneNumber: input.conversation.phoneNumber,
    contactName: input.conversation.contactName,
    reason: input.reason,
    leadInfo: input.conversation.leadInfo as LeadInfo,
    recentMessages: input.recentMessages.slice(-12),
  };

  try {
    const result = await triggerEmailAutomation("human_escalation", payload, {
      source: "whatsapp",
    });
    if (result.ok) {
      console.info("WhatsApp human handoff notification sent", {
        conversationId: input.conversation.conversationId,
      });
      return {
        notificationConfigured: true,
        notified: true,
        detail: "Handoff request sent to the configured notification workflow",
      };
    }
    console.error("WhatsApp human handoff notification failed", {
      conversationId: input.conversation.conversationId,
      error: result.error || "notification workflow failed",
    });
    return {
      notificationConfigured: true,
      notified: false,
      detail: "Configured handoff notification workflow did not accept the request",
    };
  } catch (error) {
    console.error("WhatsApp human handoff notification error", {
      conversationId: input.conversation.conversationId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return {
      notificationConfigured: true,
      notified: false,
      detail: "Configured handoff notification workflow could not be reached",
    };
  }
}

import { generateResponse, getWelcomeMessage } from "@/lib/chatbot/engine";
import type { ConversationContext, ChatMessage } from "@/lib/chatbot/types";
import { syncLeadToHubSpot, isHubSpotConfigured } from "@/lib/integrations/hubspot";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, context } = body as { message: string; context?: ConversationContext };

    // Initialize context if not provided
    const conversationContext: ConversationContext = context || {
      messages: [],
      leadInfo: {},
      sessionId: crypto.randomUUID(),
      startedAt: new Date(),
    };

    // Add user message to context
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    conversationContext.messages.push(userMessage);

    // Generate response
    const response = generateResponse(message, conversationContext);

    // Add assistant message to context
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: response.message,
      timestamp: new Date(),
      metadata: {
        intent: response.intent,
        suggestedActions: response.suggestedActions?.map(a => a.label),
      },
    };
    conversationContext.messages.push(assistantMessage);

    // Chatbot lead capture → HubSpot (best-effort, deduped by email).
    // Fires only when the visitor actually shared an email in the chat.
    let leadCaptured = false;
    const leadEmail = conversationContext.leadInfo.email?.trim().toLowerCase();
    if (
      isHubSpotConfigured() &&
      leadEmail &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)
    ) {
      try {
        const result = await syncLeadToHubSpot(
          {
            fullName: conversationContext.leadInfo.name || null,
            email: leadEmail,
            phone: conversationContext.leadInfo.phone || null,
            businessName: conversationContext.leadInfo.company || null,
            industry: conversationContext.leadInfo.industry || null,
            companySize: conversationContext.leadInfo.companySize || null,
            budgetRange: conversationContext.leadInfo.budget || null,
            timeline: conversationContext.leadInfo.timeline || null,
            biggestChallenge: conversationContext.leadInfo.challenges?.length
              ? conversationContext.leadInfo.challenges.join("; ").slice(0, 500)
              : null,
            source: "chatbot",
          },
          { dealStageLabel: "Prospecting" }
        );
        leadCaptured = result.ok;
      } catch (error) {
        console.error("Chatbot HubSpot sync failed:", error);
      }
    }

    return Response.json({
      success: true,
      response: response.message,
      suggestedActions: response.suggestedActions,
      shouldCollectInfo: response.shouldCollectInfo,
      leadCaptured,
      context: conversationContext,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      { 
        success: false, 
        error: "Something went wrong. Please try again.",
        response: "I apologize, but I encountered an issue. You can reach us directly at +91 9075707650 or akshay.navale.work@gmail.com."
      },
      { status: 500 }
    );
  }
}

// GET endpoint for welcome message
export async function GET() {
  const welcome = getWelcomeMessage();
  return Response.json({
    success: true,
    response: welcome.message,
    suggestedActions: welcome.suggestedActions,
  });
}

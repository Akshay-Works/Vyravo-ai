import { generateResponse, getWelcomeMessage } from "@/lib/chatbot/engine";
import type { ConversationContext, ChatMessage } from "@/lib/chatbot/types";

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

    return Response.json({
      success: true,
      response: response.message,
      suggestedActions: response.suggestedActions,
      shouldCollectInfo: response.shouldCollectInfo,
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

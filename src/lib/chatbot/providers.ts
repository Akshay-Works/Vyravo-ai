// AI Provider Integration Layer
// Routes chatbot turns to OpenAI (official SDK), Anthropic, Gemini, or the
// built-in deterministic engine.
//
// Provider resolution:
//   1. CHATBOT_PROVIDER, when explicitly set (internal | openai | anthropic | gemini)
//   2. "openai" automatically when OPENAI_API_KEY is present
//   3. "internal" otherwise
// This means adding OPENAI_API_KEY in Vercel is enough to switch the site
// chatbot to OpenAI, and removing it degrades cleanly back to the engine.

import { generateResponse, getWelcomeMessage } from "./engine";
import { getSystemPromptForProvider, SYSTEM_PROMPT } from "./system-prompt";
import { generateOpenAIChatResponse } from "./openai-chat";
import { isOpenAIConfigured, logOpenAIError } from "@/lib/openai/client";
import type { ConversationContext, ChatResponse, AIProviderConfig } from "./types";

type Provider = "internal" | "openai" | "anthropic" | "gemini";

const VALID_PROVIDERS: Provider[] = ["internal", "openai", "anthropic", "gemini"];

// Get provider from environment, else auto-detect from the configured keys.
export function getProvider(): Provider {
  const envProvider = process.env.CHATBOT_PROVIDER?.trim() as Provider | undefined;
  if (envProvider && VALID_PROVIDERS.includes(envProvider)) return envProvider;
  if (isOpenAIConfigured()) return "openai";
  return "internal";
}

// Main chat function - routes to appropriate provider
export async function chat(
  message: string,
  context: ConversationContext,
  config?: Partial<AIProviderConfig>
): Promise<ChatResponse> {
  const provider = config?.provider || getProvider();

  switch (provider) {
    case "openai":
      return chatWithOpenAI(message, context);
    case "anthropic":
      return chatWithAnthropic(message, context, config);
    case "gemini":
      return chatWithGemini(message, context, config);
    case "internal":
    default:
      return generateResponse(message, context);
  }
}

// OpenAI Integration — official SDK, Responses API, structured outputs.
// Falls back to the internal engine so the chatbot never goes dark.
async function chatWithOpenAI(
  message: string,
  context: ConversationContext
): Promise<ChatResponse> {
  if (!isOpenAIConfigured()) {
    console.warn("[chatbot] OPENAI_API_KEY not configured — using the internal engine");
    return generateResponse(message, context);
  }

  try {
    const result = await generateOpenAIChatResponse({
      message,
      history: context.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      leadInfo: context.leadInfo,
    });

    return { message: result.reply, intent: result.intent };
  } catch (error) {
    logOpenAIError("chatbot.provider", error);
    return generateResponse(message, context); // Fallback — never break the chat
  }
}

// Anthropic Integration (Claude)
async function chatWithAnthropic(
  message: string,
  context: ConversationContext,
  config?: Partial<AIProviderConfig>
): Promise<ChatResponse> {
  const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.warn("Anthropic API key not configured, falling back to internal engine");
    return generateResponse(message, context);
  }

  try {
    const messages = context.messages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config?.model || "claude-3-5-sonnet-20241022",
        max_tokens: config?.maxTokens ?? 500,
        system: getSystemPromptForProvider("anthropic"),
        messages,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "Anthropic API error");
    }

    return {
      message: data.content[0].text,
    };
  } catch (error) {
    console.error("Anthropic chat error:", error);
    return generateResponse(message, context); // Fallback
  }
}

// Google Gemini Integration
async function chatWithGemini(
  message: string,
  context: ConversationContext,
  config?: Partial<AIProviderConfig>
): Promise<ChatResponse> {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn("Gemini API key not configured, falling back to internal engine");
    return generateResponse(message, context);
  }

  try {
    const contents = context.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    contents.push({ role: "user", parts: [{ text: message }] });

    const model = config?.model || "gemini-1.5-pro";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: getSystemPromptForProvider("gemini") }] },
          generationConfig: {
            temperature: config?.temperature ?? 0.7,
            maxOutputTokens: config?.maxTokens ?? 500,
          },
        }),
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "Gemini API error");
    }

    return {
      message: data.candidates[0].content.parts[0].text,
    };
  } catch (error) {
    console.error("Gemini chat error:", error);
    return generateResponse(message, context); // Fallback
  }
}

// Export welcome message function
export { getWelcomeMessage };

// Export for reference
export { SYSTEM_PROMPT };

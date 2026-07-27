// AI Provider Integration Layer
// Ready for OpenAI, Anthropic, Gemini integration
// Currently uses internal engine, can be switched via environment variable

import { generateResponse, getWelcomeMessage } from "./engine";
import { getSystemPromptForProvider, SYSTEM_PROMPT } from "./system-prompt";
import type { ConversationContext, ChatResponse, AIProviderConfig } from "./types";

type Provider = "internal" | "openai" | "anthropic" | "gemini";

const DEFAULT_PROVIDER: Provider = "internal";

// Get provider from environment or default
export function getProvider(): Provider {
  const envProvider = process.env.CHATBOT_PROVIDER as Provider | undefined;
  return envProvider || DEFAULT_PROVIDER;
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
      return chatWithOpenAI(message, context, config);
    case "anthropic":
      return chatWithAnthropic(message, context, config);
    case "gemini":
      return chatWithGemini(message, context, config);
    case "internal":
    default:
      return generateResponse(message, context);
  }
}

// OpenAI Integration (GPT-4, GPT-4o, etc.)
async function chatWithOpenAI(
  message: string,
  context: ConversationContext,
  config?: Partial<AIProviderConfig>
): Promise<ChatResponse> {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn("OpenAI API key not configured, falling back to internal engine");
    return generateResponse(message, context);
  }

  try {
    const messages = [
      { role: "system" as const, content: getSystemPromptForProvider("openai") },
      ...context.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config?.model || "gpt-4o",
        messages,
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.maxTokens ?? 500,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI API error");
    }

    return {
      message: data.choices[0].message.content,
    };
  } catch (error) {
    console.error("OpenAI chat error:", error);
    return generateResponse(message, context); // Fallback
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

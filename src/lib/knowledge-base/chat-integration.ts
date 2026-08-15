// Chatbot ↔ Knowledge Base integration
//
// The website chatbot keeps its existing engine, but when the Knowledge Base
// contains PUBLIC + APPROVED content that matches the visitor's question, we
// retrieve it and use it to answer. All KB access here goes through
// searchPublicKnowledge() which can only ever return PUBLIC + APPROVED content.
//
// The chatbot is NEVER broken by the KB: every path falls back to the original
// engine if retrieval fails, is disabled, or returns nothing useful.

import type { ConversationContext, ChatResponse } from "@/lib/chatbot/types";
import { getProvider } from "@/lib/chatbot/providers";
import { searchPublicKnowledge, buildPublicContext, hasPublicKnowledge } from "./public-client";
import { detectIntent } from "@/lib/chatbot/engine";

// Local (Xenova MiniLM) scores sit ~0.3–0.5; OpenAI scores ~0.6–0.9.
const KB_MIN_SCORE =
  (process.env.EMBEDDING_PROVIDER === "openai" ||
    process.env.EMBEDDING_PROVIDER === "cohere" ||
    process.env.EMBEDDING_PROVIDER === "google")
    ? 0.35
    : 0.26;

export interface KBChatOutcome {
  /** The response to show the visitor. */
  response: string;
  /** Whether the answer came from the Knowledge Base. */
  usedKb: boolean;
  /** KB sources (for internal logging; not shown to visitors). */
  sources?: { documentId: number; documentTitle: string }[];
}

/**
 * Try to answer a visitor message from the PUBLIC Knowledge Base.
 * Returns null when the KB shouldn't be used (no data, no match, or the
 * existing engine already handles this intent well).
 */
const KB_TIMEOUT_MS = 4000;

function withKbTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("KB lookup timed out")), KB_TIMEOUT_MS);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export async function tryKnowledgeBaseAnswer(
  message: string,
  context: ConversationContext
): Promise<KBChatOutcome | null> {
  try {
    const kb = await withKbTimeout(hasPublicKnowledge());
    if (!kb) return null;

    const hits = await searchPublicKnowledge({
      query: message,
      topK: 4,
      threshold: KB_MIN_SCORE,
    });

    // No strong match → let the existing chatbot engine answer.
    if (hits.length === 0 || hits[0].score < KB_MIN_SCORE) return null;

    const provider = getProvider();
    const intent = detectIntent(message);

    // 1) Real LLM provider configured → answer from KB context (citations stripped for visitors)
    if (provider !== "internal") {
      const llmAnswer = await answerWithProvider(message, hits, provider);
      if (llmAnswer) {
        return {
          response: llmAnswer,
          usedKb: true,
          sources: hits.map((h) => ({ documentId: h.documentId, documentTitle: h.documentTitle })),
        };
      }
    }

    // 2) Internal engine: only override the generic fallback; specific intents
    //    (services, pricing, booking…) are already well-handled by the engine.
    if (intent === "general") {
      const top = hits[0];
      let answer = top.content.slice(0, 800);
      if (hits.length > 1) {
        answer += "\n\n" + hits[1].content.slice(0, 400);
      }
      return {
        response: answer.trim(),
        usedKb: true,
        sources: hits.map((h) => ({ documentId: h.documentId, documentTitle: h.documentTitle })),
      };
    }

    return null;
  } catch (e) {
    // Never break the chatbot because of KB issues.
    console.error("KB chatbot integration error (falling back to engine):", e);
    return null;
  }
}

/** Ask the configured LLM provider to answer strictly from KB context. */
async function answerWithProvider(
  message: string,
  hits: { documentTitle: string; content: string; section: string | null }[],
  provider: "openai" | "anthropic" | "gemini"
): Promise<string | null> {
  const context = buildPublicContext(hits as any);

  const systemPrompt = `You are the Vyravo AI website assistant. Answer the visitor's question using ONLY the provided company knowledge below.
Rules:
1. Answer ONLY from the provided knowledge. NEVER invent services, prices, client names, stats, case studies, or policies.
2. If the knowledge does not answer the question, say you don't have that information and suggest booking a free discovery call or contacting +91 9075707650 / akshay.navale.work@gmail.com.
3. Do not mention "knowledge base", "sources", or "[1]" citations. Write naturally, concise and friendly.
4. Keep formatting light (short bullets are fine).`;

  const userPrompt = `Company Knowledge:\n\n${context}\n\n---\n\nVisitor question: ${message}`;

  try {
    switch (provider) {
      case "openai": {
        const key = process.env.OPENAI_API_KEY;
        if (!key) return null;
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: process.env.CHATBOT_LLM_MODEL || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
      }
      case "anthropic": {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) return null;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 500,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.content?.[0]?.text?.trim() || null;
      }
      case "gemini": {
        const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!key) return null;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
            }),
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }
      default:
        return null;
    }
  } catch (e) {
    console.error("KB LLM answer failed:", e);
    return null;
  }
}

// Re-export for type convenience
export type { ChatResponse };

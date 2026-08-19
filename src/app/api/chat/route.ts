// Vyravo AI website chatbot API.
//
// Flow: visitor → validation + rate limit → OpenAI (grounded in the site
// content + PUBLIC Knowledge Base) → lead qualification → EXISTING HubSpot CRM
// sync + EXISTING discovery-call booking link.
//
// SECURITY: OPENAI_API_KEY is read server-side only (see lib/openai/client.ts).
// It is never returned to the browser, never logged, and never included in an
// error payload.
//
// RESILIENCE: if OpenAI is unconfigured or fails, the request degrades to the
// existing Knowledge Base + deterministic engine path, so the chatbot keeps
// answering. Only a total failure returns the friendly error message.

import { generateResponse, getWelcomeMessage } from "@/lib/chatbot/engine";
import { generateOpenAIChatResponse, MAX_HISTORY_TURNS } from "@/lib/chatbot/openai-chat";
import type { ConversationContext, ChatMessage, LeadInfo, QuickAction } from "@/lib/chatbot/types";
import { isOpenAIConfigured, logOpenAIError, USER_FACING_AI_ERROR } from "@/lib/openai/client";
import { syncLeadToHubSpot, isHubSpotConfigured } from "@/lib/integrations/hubspot";
import {
  tryKnowledgeBaseAnswer,
  getPublicKnowledgeContext,
} from "@/lib/knowledge-base/chat-integration";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { emitEvent } from "@/lib/workflows/engine";
import { SITE_LINKS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Guard rails on untrusted input. */
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = MAX_HISTORY_TURNS * 2;
const MAX_HISTORY_CONTENT_CHARS = 4000;

const CONTACT_FALLBACK =
  "I apologize, but I encountered an issue. You can reach us directly at +91 9075707650 or akshay.navale.work@gmail.com.";

// ---------------------------------------------------------------------------
// Input validation / sanitisation
// ---------------------------------------------------------------------------

function badRequest(response: string, error: string) {
  return Response.json({ success: false, error, response }, { status: 400 });
}

function sanitizeString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : undefined;
}

/** Rebuild a trustworthy context from whatever the client sent back. */
function sanitizeContext(raw: unknown): ConversationContext {
  const input = (raw ?? {}) as Partial<ConversationContext>;

  const messages: ChatMessage[] = Array.isArray(input.messages)
    ? input.messages
        .filter(
          (m): m is ChatMessage =>
            Boolean(m) &&
            typeof (m as ChatMessage).content === "string" &&
            ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant")
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({
          id: sanitizeString(m.id, 64) || crypto.randomUUID(),
          role: m.role,
          content: m.content.slice(0, MAX_HISTORY_CONTENT_CHARS),
          timestamp: new Date(),
        }))
    : [];

  const rawLead = (input.leadInfo ?? {}) as Record<string, unknown>;
  const leadInfo: LeadInfo = {
    name: sanitizeString(rawLead.name, 120),
    email: sanitizeString(rawLead.email, 200),
    phone: sanitizeString(rawLead.phone, 50),
    company: sanitizeString(rawLead.company, 160),
    companySize: sanitizeString(rawLead.companySize, 80),
    industry: sanitizeString(rawLead.industry, 120),
    budget: sanitizeString(rawLead.budget, 120),
    timeline: sanitizeString(rawLead.timeline, 120),
    currentWorkflow: sanitizeString(rawLead.currentWorkflow, 500),
    desiredOutcome: sanitizeString(rawLead.desiredOutcome, 500),
    challenges: Array.isArray(rawLead.challenges)
      ? (rawLead.challenges as unknown[])
          .map((c) => sanitizeString(c, 500))
          .filter((c): c is string => Boolean(c))
          .slice(0, 10)
      : undefined,
    interests: Array.isArray(rawLead.interests)
      ? (rawLead.interests as unknown[])
          .map((c) => sanitizeString(c, 120))
          .filter((c): c is string => Boolean(c))
          .slice(0, 10)
      : undefined,
    qualified: typeof rawLead.qualified === "boolean" ? rawLead.qualified : undefined,
  };

  // Drop undefined keys so downstream `Object.assign` merges stay clean.
  (Object.keys(leadInfo) as (keyof LeadInfo)[]).forEach((k) => {
    if (leadInfo[k] === undefined) delete leadInfo[k];
  });

  return {
    messages,
    leadInfo,
    sessionId: sanitizeString(input.sessionId, 64) || crypto.randomUUID(),
    startedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Lead helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Merge AI-extracted facts into the conversation's lead record (never overwrite with null). */
function mergeExtractedLead(
  leadInfo: LeadInfo,
  extracted: {
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    industry: string | null;
    businessSize: string | null;
    mainProblem: string | null;
    currentWorkflow: string | null;
    desiredOutcome: string | null;
  },
  interestLevel: LeadInfo["interestLevel"]
): void {
  if (extracted.name) leadInfo.name = extracted.name;
  if (extracted.company) leadInfo.company = extracted.company;
  if (extracted.industry) leadInfo.industry = extracted.industry;
  if (extracted.businessSize) leadInfo.companySize = extracted.businessSize;
  if (extracted.phone) leadInfo.phone = extracted.phone;
  if (extracted.currentWorkflow) leadInfo.currentWorkflow = extracted.currentWorkflow;
  if (extracted.desiredOutcome) leadInfo.desiredOutcome = extracted.desiredOutcome;
  if (interestLevel) leadInfo.interestLevel = interestLevel;

  // Only accept a well-formed email — this value drives the CRM sync.
  const email = extracted.email?.trim().toLowerCase();
  if (email && EMAIL_RE.test(email)) leadInfo.email = email;

  if (extracted.mainProblem) {
    const challenges = leadInfo.challenges ?? [];
    if (!challenges.includes(extracted.mainProblem)) challenges.push(extracted.mainProblem);
    leadInfo.challenges = challenges.slice(-10);
  }

  leadInfo.qualified = Boolean(
    leadInfo.email && (leadInfo.company || leadInfo.industry) && leadInfo.challenges?.length
  );
}

/** The existing discovery-call booking flow — reused, never duplicated. */
function bookingActions(): QuickAction[] {
  return [
    { id: "book", label: "📅 Book Discovery Call", action: "link", value: SITE_LINKS.discoveryCall },
    { id: "later", label: "Maybe later", action: "message", value: "Not right now, thanks" },
  ];
}

/** Push the captured lead into the EXISTING HubSpot workflow (best-effort, deduped by email). */
async function syncLead(context: ConversationContext): Promise<boolean> {
  const leadEmail = context.leadInfo.email?.trim().toLowerCase();
  if (!isHubSpotConfigured() || !leadEmail || !EMAIL_RE.test(leadEmail)) return false;

  try {
    const { leadInfo } = context;
    const result = await syncLeadToHubSpot(
      {
        fullName: leadInfo.name || null,
        email: leadEmail,
        phone: leadInfo.phone || null,
        businessName: leadInfo.company || null,
        industry: leadInfo.industry || null,
        companySize: leadInfo.companySize || null,
        budgetRange: leadInfo.budget || null,
        timeline: leadInfo.timeline || null,
        biggestChallenge: leadInfo.challenges?.length
          ? leadInfo.challenges.join("; ").slice(0, 500)
          : null,
        automationGoals: leadInfo.desiredOutcome || null,
        qualificationSummary: leadInfo.currentWorkflow
          ? `Current workflow: ${leadInfo.currentWorkflow}`.slice(0, 500)
          : null,
        leadCategory: leadInfo.interestLevel && leadInfo.interestLevel !== "unknown"
          ? `${leadInfo.interestLevel} interest`
          : null,
        source: "chatbot",
      },
      { dealStageLabel: "Prospecting" }
    );

    if (result.ok) {
      try {
        await emitEvent("lead_created", {
          metadata: { source: "chatbot", email: leadEmail },
        });
      } catch {}
    }
    return result.ok;
  } catch (error) {
    console.error("Chatbot HubSpot sync failed:", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. Rate limit (per IP, in-memory sliding window — same util as the KB APIs)
  const limit = rateLimit("chat", clientIp(request));
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSec);

  // 2. Parse + validate the body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("I couldn't read that message. Please try again.", "Invalid JSON body");
  }

  const { message: rawMessage, context: rawContext } = (body ?? {}) as {
    message?: unknown;
    context?: unknown;
  };

  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    return badRequest("Please type a message so I can help.", "Message is required");
  }
  if (rawMessage.length > MAX_MESSAGE_CHARS) {
    return badRequest(
      `That message is a bit long for me (limit ${MAX_MESSAGE_CHARS} characters). Could you shorten it, or book a discovery call so we can talk it through?`,
      "Message too long"
    );
  }

  const message = rawMessage.trim();
  const conversationContext = sanitizeContext(rawContext);

  // History for the model = everything BEFORE this new message.
  const history = conversationContext.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  conversationContext.messages.push({
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    timestamp: new Date(),
  });

  try {
    let replyText: string | null = null;
    let intent: string | undefined;
    let suggestedActions: QuickAction[] | undefined;
    let shouldCollectInfo: keyof LeadInfo | undefined;
    let usedKb = false;
    let aiProvider: "openai" | "internal" = "internal";
    let degraded = false;

    // 3a. Preferred path — OpenAI, grounded in the site content + PUBLIC KB.
    if (isOpenAIConfigured()) {
      try {
        const kb = await getPublicKnowledgeContext(message);
        const result = await generateOpenAIChatResponse({
          message,
          history,
          leadInfo: conversationContext.leadInfo,
          knowledgeContext: kb?.context ?? null,
        });

        replyText = result.reply;
        intent = result.intent;
        usedKb = Boolean(kb);
        aiProvider = "openai";

        mergeExtractedLead(conversationContext.leadInfo, result.lead, result.interestLevel);

        // Clear booking intent → hand off to the EXISTING discovery-call flow.
        if (result.readyToBook || result.intent === "booking") {
          suggestedActions = bookingActions();
        }
      } catch (error) {
        logOpenAIError("api.chat", error);
        degraded = true; // fall through to the existing engine
      }
    }

    // 3b. Fallback path — the pre-existing KB + deterministic engine behaviour.
    if (replyText === null) {
      const kbOutcome = await tryKnowledgeBaseAnswer(message, conversationContext);
      if (kbOutcome) {
        replyText = kbOutcome.response;
        usedKb = kbOutcome.usedKb;
      } else {
        const engineResponse = generateResponse(message, conversationContext);
        replyText = engineResponse.message;
        intent = engineResponse.intent;
        suggestedActions = engineResponse.suggestedActions;
        shouldCollectInfo = engineResponse.shouldCollectInfo;
      }
    }

    // 4. Record the assistant turn
    conversationContext.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: replyText,
      timestamp: new Date(),
      metadata: {
        intent,
        suggestedActions: suggestedActions?.map((a) => a.label),
      },
    });

    // 5. Existing CRM workflow — unchanged, now fed by AI-extracted lead data.
    const leadCaptured = await syncLead(conversationContext);

    return Response.json({
      success: true,
      response: replyText,
      suggestedActions,
      shouldCollectInfo,
      leadCaptured,
      usedKb,
      aiProvider,
      degraded,
      context: conversationContext,
    });
  } catch (error) {
    // Total failure — never leak internals to the visitor.
    console.error("Chat API error:", error instanceof Error ? error.message : "unknown error");
    return Response.json(
      {
        success: false,
        error: "Chat request failed",
        response: USER_FACING_AI_ERROR,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for welcome message
export async function GET() {
  try {
    const welcome = getWelcomeMessage();
    return Response.json({
      success: true,
      response: welcome.message,
      suggestedActions: welcome.suggestedActions,
    });
  } catch (error) {
    console.error("Chat welcome error:", error instanceof Error ? error.message : "unknown error");
    return Response.json(
      { success: false, error: "Welcome message failed", response: CONTACT_FALLBACK },
      { status: 500 }
    );
  }
}

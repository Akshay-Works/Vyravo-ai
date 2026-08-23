// WhatsApp conversation orchestration.
//
// This adapts the existing Vyravo AI chatbot engine and OpenAI/Knowledge Base
// path to the official WhatsApp Cloud API. It never trusts conversation state
// supplied by a caller: state comes from the server-side WhatsApp store.

import { createHash } from "node:crypto";
import { generateResponse } from "@/lib/chatbot/engine";
import { generateOpenAIChatResponse, MAX_HISTORY_TURNS } from "@/lib/chatbot/openai-chat";
import type { ChatMessage, ConversationContext, LeadInfo } from "@/lib/chatbot/types";
import { isOpenAIConfigured, logOpenAIError } from "@/lib/openai/client";
import { tryKnowledgeBaseAnswer, getPublicKnowledgeContext } from "@/lib/knowledge-base/chat-integration";
import { rateLimit } from "@/lib/knowledge-base/rate-limit";
import { emitEvent } from "@/lib/workflows/engine";
import { isHubSpotConfigured, syncLeadToHubSpot } from "@/lib/integrations/hubspot";
import { SITE_LINKS } from "@/lib/constants";
import {
  formatWhatsAppPhone,
  isWhatsAppConfigured,
  maskWhatsAppPhone,
  normalizeWhatsAppPhone,
  sendWhatsAppTextMessage,
  WHATSAPP_MAX_TEXT_LENGTH,
} from "./meta";
import { notifyWhatsAppHumanHandoff } from "./handoff";
import {
  createMemoryWhatsAppStore,
  getWhatsAppStore,
  setWhatsAppStore,
} from "./storage";
import type {
  WhatsAppConversation,
  WhatsAppMessageEvent,
  WhatsAppProcessResult,
  WhatsAppStore,
  WhatsAppStatusEvent,
} from "./types";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_MESSAGES = MAX_HISTORY_TURNS * 2;
const MAX_LEAD_TEXT_CHARS = 500;
const HANDOFF_REASON = "Visitor requested human assistance";

const UNSUPPORTED_MESSAGE =
  "I can currently help with text messages. Please send your question as text, or contact the Vyravo AI team at +91 9075707650 or akshay.navale.work@gmail.com.";
const AI_FAILURE_MESSAGE =
  "I’m sorry, I’m having trouble processing that right now. Please try again shortly, or contact us at +91 9075707650 or akshay.navale.work@gmail.com.";

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function cleanLeadInfo(value: unknown): LeadInfo {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const lead: LeadInfo = {
    name: cleanText(raw.name, 120),
    email: cleanText(raw.email, 200)?.toLowerCase(),
    phone: cleanText(raw.phone, 50),
    company: cleanText(raw.company, 160),
    companySize: cleanText(raw.companySize, 80),
    industry: cleanText(raw.industry, 120),
    budget: cleanText(raw.budget, 120),
    timeline: cleanText(raw.timeline, 120),
    currentWorkflow: cleanText(raw.currentWorkflow, MAX_LEAD_TEXT_CHARS),
    desiredOutcome: cleanText(raw.desiredOutcome, MAX_LEAD_TEXT_CHARS),
    challenges: Array.isArray(raw.challenges)
      ? raw.challenges.map((item) => cleanText(item, MAX_LEAD_TEXT_CHARS)).filter((item): item is string => Boolean(item)).slice(0, 10)
      : undefined,
    interests: Array.isArray(raw.interests)
      ? raw.interests.map((item) => cleanText(item, 120)).filter((item): item is string => Boolean(item)).slice(0, 10)
      : undefined,
    qualified: typeof raw.qualified === "boolean" ? raw.qualified : undefined,
    interestLevel:
      raw.interestLevel === "low" || raw.interestLevel === "medium" || raw.interestLevel === "high" || raw.interestLevel === "unknown"
        ? raw.interestLevel
        : undefined,
    preferredContactMethod:
      raw.preferredContactMethod === "whatsapp" || raw.preferredContactMethod === "phone" || raw.preferredContactMethod === "email"
        ? raw.preferredContactMethod
        : undefined,
    discoveryCallRequested: typeof raw.discoveryCallRequested === "boolean" ? raw.discoveryCallRequested : undefined,
  };

  (Object.keys(lead) as (keyof LeadInfo)[]).forEach((key) => {
    if (lead[key] === undefined) delete lead[key];
  });
  return lead;
}

function mergeLeadInfo(
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
  const assign = (key: keyof LeadInfo, value: string | undefined, maxLength: number) => {
    const cleaned = cleanText(value, maxLength);
    if (cleaned) (leadInfo[key] as string | undefined) = cleaned;
  };

  assign("name", extracted.name || undefined, 120);
  assign("company", extracted.company || undefined, 160);
  assign("industry", extracted.industry || undefined, 120);
  assign("companySize", extracted.businessSize || undefined, 80);
  // The sender's WhatsApp number is authoritative; never replace it with a
  // model-extracted number that could be a number mentioned in the message.
  assign("currentWorkflow", extracted.currentWorkflow || undefined, MAX_LEAD_TEXT_CHARS);
  assign("desiredOutcome", extracted.desiredOutcome || undefined, MAX_LEAD_TEXT_CHARS);

  const email = cleanText(extracted.email, 200)?.toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) leadInfo.email = email;
  if (interestLevel) leadInfo.interestLevel = interestLevel;

  const problem = cleanText(extracted.mainProblem, MAX_LEAD_TEXT_CHARS);
  if (problem) {
    const challenges = leadInfo.challenges || [];
    if (!challenges.includes(problem)) challenges.push(problem);
    leadInfo.challenges = challenges.slice(-10);
  }
}

function addInterest(leadInfo: LeadInfo, intent: string | undefined): void {
  const interestMap: Record<string, string> = {
    chatbot: "AI Chatbots",
    voiceAgent: "AI Voice Agents",
    workflow: "AI Workflow Automation",
    sales: "AI Sales Automation",
    custom: "Custom AI Solutions",
  };
  const interest = intent ? interestMap[intent] : undefined;
  if (!interest) return;
  const interests = leadInfo.interests || [];
  if (!interests.includes(interest)) interests.push(interest);
  leadInfo.interests = interests.slice(-10);
}

function hasUsefulProblem(leadInfo: LeadInfo): boolean {
  return Boolean(
    leadInfo.challenges?.length || leadInfo.currentWorkflow || leadInfo.desiredOutcome
  );
}

function isQualifiedLead(leadInfo: LeadInfo): boolean {
  return Boolean(
    leadInfo.name &&
      (leadInfo.company || leadInfo.industry) &&
      hasUsefulProblem(leadInfo)
  );
}

function qualificationState(leadInfo: LeadInfo, bookingRequested: boolean): WhatsAppConversation["qualificationState"] {
  if (bookingRequested) return "booking_requested";
  if (isQualifiedLead(leadInfo)) return "qualified";
  if (Object.keys(leadInfo).length > 1) return "qualifying";
  return "new";
}

function containsBookingIntent(message: string, intent?: string, readyToBook?: boolean): boolean {
  return Boolean(
    readyToBook ||
      intent === "booking" ||
      /\b(book|schedule|set up|arrange)\b.{0,30}\b(call|meeting|consultation|demo)\b/i.test(message) ||
      /\b(discovery call|book a call|schedule a call)\b/i.test(message)
  );
}

/** Explicit handoff phrases only; mentioning an "AI agent" is not a handoff. */
export function isHumanHandoffRequest(message: string): boolean {
  return Boolean(
    /^\s*(human|agent|representative|person)\s*[.!?]*\s*$/i.test(message) ||
      /\b(?:talk|speak|connect)\s+(?:to|with)\s+(?:a\s+)?(?:human|person|real person|representative|agent|someone)\b/i.test(message) ||
      /\b(?:real person|support team|customer service|human assistance)\b/i.test(message) ||
      /\b(?:call|phone)\s+me\b/i.test(message) ||
      /\b(?:need|want)\s+(?:a\s+)?(?:human|person|real person|representative|agent|support)\b/i.test(message)
  );
}

function compactWhatsAppReply(reply: string): string {
  // WhatsApp supports a simple asterisk format. Keep the existing engine's
  // useful emphasis while avoiding web-only Markdown constructs.
  let output = reply
    .replace(/\*\*([\s\S]*?)\*\*/g, "*$1*")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (output.length > WHATSAPP_MAX_TEXT_LENGTH) {
    output = `${output.slice(0, WHATSAPP_MAX_TEXT_LENGTH - 1).trimEnd()}…`;
  }
  return output;
}

function addBookingLink(reply: string): string {
  if (reply.includes(SITE_LINKS.discoveryCall)) return reply;
  return `${reply.trim()}\n\nBook a discovery call: ${SITE_LINKS.discoveryCall}`;
}

function buildQualificationSummary(
  conversation: WhatsAppConversation,
  leadInfo: LeadInfo
): string {
  const facts = [
    leadInfo.name ? `Name: ${leadInfo.name}` : null,
    leadInfo.company ? `Company: ${leadInfo.company}` : null,
    leadInfo.industry ? `Industry: ${leadInfo.industry}` : null,
    leadInfo.companySize ? `Business size: ${leadInfo.companySize}` : null,
    leadInfo.challenges?.length ? `Problem: ${leadInfo.challenges.join("; ")}` : null,
    leadInfo.currentWorkflow ? `Current process: ${leadInfo.currentWorkflow}` : null,
    leadInfo.desiredOutcome ? `Desired outcome: ${leadInfo.desiredOutcome}` : null,
    leadInfo.timeline ? `Timeline: ${leadInfo.timeline}` : null,
    leadInfo.budget ? `Budget: ${leadInfo.budget}` : null,
    leadInfo.preferredContactMethod ? `Preferred contact: ${leadInfo.preferredContactMethod}` : null,
    leadInfo.discoveryCallRequested ? "Discovery call requested" : null,
  ].filter((value): value is string => Boolean(value));

  return `WhatsApp conversation ${conversation.conversationId}. ${facts.join(" | ")}`.slice(0, 2000);
}

function leadFingerprint(leadInfo: LeadInfo): string {
  const normalized = {
    name: leadInfo.name || null,
    email: leadInfo.email || null,
    phone: leadInfo.phone || null,
    company: leadInfo.company || null,
    industry: leadInfo.industry || null,
    companySize: leadInfo.companySize || null,
    challenges: leadInfo.challenges || [],
    currentWorkflow: leadInfo.currentWorkflow || null,
    desiredOutcome: leadInfo.desiredOutcome || null,
    budget: leadInfo.budget || null,
    timeline: leadInfo.timeline || null,
    discoveryCallRequested: Boolean(leadInfo.discoveryCallRequested),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function createConversationContext(
  conversation: WhatsAppConversation,
  leadInfo: LeadInfo,
  messages: ChatMessage[]
): ConversationContext {
  return {
    messages: messages.slice(-MAX_HISTORY_MESSAGES),
    leadInfo,
    sessionId: conversation.conversationId,
    startedAt: new Date(conversation.createdAt),
  };
}

async function sendAndLog(
  store: WhatsAppStore,
  conversation: WhatsAppConversation,
  event: WhatsAppMessageEvent,
  body: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const message = compactWhatsAppReply(body);
  if (!isWhatsAppConfigured()) {
    console.error("WhatsApp response not sent: Meta Cloud API is not configured", {
      conversationId: conversation.conversationId,
    });
    return false;
  }

  let result: Awaited<ReturnType<typeof sendWhatsAppTextMessage>>;
  try {
    result = await sendWhatsAppTextMessage(event.from, message, event.messageId);
  } catch (error) {
    console.error("WhatsApp response failed", {
      conversationId: conversation.conversationId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    try {
      await store.recordOutboundMessage({
        conversationDbId: conversation.id,
        providerMessageId: `failed_${createHash("sha256").update(`${conversation.conversationId}:${Date.now()}`).digest("hex").slice(0, 32)}`,
        body: message,
        deliveryStatus: "failed",
        metadata: { ...metadata, replyToMessageId: event.messageId },
      });
    } catch (logError) {
      console.error("WhatsApp failed response could not be logged", {
        conversationId: conversation.conversationId,
        error: logError instanceof Error ? logError.message : "unknown error",
      });
    }
    return false;
  }

  // The provider accepted the message. A logging failure must not mark the
  // inbound event as failed, or a Meta retry could send a duplicate response.
  const providerMessageId = result.messageId || `local_${createHash("sha256").update(`${conversation.conversationId}:${Date.now()}:${message}`).digest("hex").slice(0, 32)}`;
  try {
    await store.recordOutboundMessage({
      conversationDbId: conversation.id,
      providerMessageId,
      body: message,
      deliveryStatus: "sent",
      metadata: { ...metadata, replyToMessageId: event.messageId },
    });
  } catch (logError) {
    console.error("WhatsApp response sent but could not be logged", {
      conversationId: conversation.conversationId,
      providerMessageId,
      error: logError instanceof Error ? logError.message : "unknown error",
    });
  }
  console.info("WhatsApp response sent", {
    conversationId: conversation.conversationId,
    providerMessageId,
  });
  return true;
}

const claimedInboundMessages = new Map<string, { store: WhatsAppStore; conversationId: string }>();

async function markInboundProcessing(
  store: WhatsAppStore,
  providerMessageId: string,
  succeeded: boolean,
  conversationId: string
): Promise<void> {
  try {
    await store.markInboundMessage(providerMessageId, succeeded);
  } catch (error) {
    console.error("WhatsApp inbound processing state could not be updated", {
      conversationId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  } finally {
    claimedInboundMessages.delete(providerMessageId);
  }
}

async function persistLeadAndState(
  store: WhatsAppStore,
  conversation: WhatsAppConversation,
  leadInfo: LeadInfo,
  bookingRequested: boolean,
  patch: Partial<Pick<WhatsAppConversation, "status" | "qualificationState" | "handoffReason" | "handoffNotificationStatus">> = {}
): Promise<WhatsAppConversation> {
  const updated = await store.updateConversation(conversation.conversationId, {
    qualificationState: qualificationState(leadInfo, bookingRequested),
    leadInfo,
    ...patch,
  });
  return updated || { ...conversation, ...patch, leadInfo };
}

async function syncQualifiedLead(
  store: WhatsAppStore,
  conversation: WhatsAppConversation,
  leadInfo: LeadInfo
): Promise<void> {
  const shouldSync = isQualifiedLead(leadInfo) || Boolean(leadInfo.discoveryCallRequested);
  if (!shouldSync) return;

  const fingerprint = leadFingerprint(leadInfo);
  if (conversation.crmSyncStatus === "synced" && conversation.crmSyncFingerprint === fingerprint) return;

  const summary = buildQualificationSummary(conversation, leadInfo);
  try {
    const result = await syncLeadToHubSpot(
      {
        fullName: leadInfo.name || conversation.contactName || null,
        email: leadInfo.email || null,
        phone: leadInfo.phone || formatWhatsAppPhone(conversation.phoneNumber),
        businessName: leadInfo.company || null,
        industry: leadInfo.industry || null,
        companySize: leadInfo.companySize || null,
        biggestChallenge: leadInfo.challenges?.join("; ").slice(0, MAX_LEAD_TEXT_CHARS) || null,
        automationGoals: leadInfo.desiredOutcome || null,
        budgetRange: leadInfo.budget || null,
        timeline: leadInfo.timeline || null,
        qualificationSummary: summary,
        preferredContactMethod: leadInfo.preferredContactMethod || "whatsapp",
        leadCategory: leadInfo.interestLevel && leadInfo.interestLevel !== "unknown"
          ? `${leadInfo.interestLevel} interest`
          : null,
        source: "whatsapp",
      },
      {
        dealStageLabel: "Prospecting",
        dealName: `${leadInfo.company || leadInfo.name || conversation.phoneNumber} — WhatsApp AI Lead`,
      }
    );

    const nextStatus = result.ok ? "synced" : result.configured ? "failed" : "not_configured";
    await store.updateConversation(conversation.conversationId, {
      crmSyncStatus: nextStatus,
      crmSyncFingerprint: result.ok ? fingerprint : null,
    });

    if (result.ok) {
      console.info("WhatsApp CRM update completed", {
        conversationId: conversation.conversationId,
        action: result.action,
      });
      await emitEvent("lead_created", {
        metadata: {
          source: "whatsapp",
          conversationId: conversation.conversationId,
          email: leadInfo.email || undefined,
          phone: conversation.phoneNumber,
          nonce: conversation.conversationId,
        },
      });
    } else {
      console.error("WhatsApp CRM update did not complete", {
        conversationId: conversation.conversationId,
        configured: result.configured,
        error: result.error || "unknown CRM error",
      });
    }
  } catch (error) {
    console.error("WhatsApp CRM update failed", {
      conversationId: conversation.conversationId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    try {
      await store.updateConversation(conversation.conversationId, {
        crmSyncStatus: "failed",
        crmSyncFingerprint: null,
      });
    } catch {
      // The original error is already logged; do not mask it with a storage error.
    }
  }

}

async function prepareMessage(
  event: WhatsAppMessageEvent
): Promise<{ store: WhatsAppStore; conversation: WhatsAppConversation; history: ChatMessage[]; duplicate: boolean }> {
  let store = getWhatsAppStore();
  try {
    const conversation = await store.getOrCreateConversation(event.from, event.profileName);
    const recorded = await store.recordInboundMessage(conversation.id, event);
    return {
      store,
      conversation,
      history: conversation.recentMessages,
      duplicate: recorded.duplicate,
    };
  } catch (error) {
    if (store.mode !== "database") throw error;
    // Keep the webhook acknowledgement resilient during a transient database
    // outage. This is explicitly a degraded, process-local fallback; the next
    // healthy instance will return to PostgreSQL automatically.
    console.error("WhatsApp persistence unavailable; using memory fallback", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    store = createMemoryWhatsAppStore();
    setWhatsAppStore(store);
    const conversation = await store.getOrCreateConversation(event.from, event.profileName);
    const recorded = await store.recordInboundMessage(conversation.id, event);
    return { store, conversation, history: conversation.recentMessages, duplicate: recorded.duplicate };
  }
}

async function handleMessageEvent(event: WhatsAppMessageEvent): Promise<WhatsAppProcessResult> {
  const phone = normalizeWhatsAppPhone(event.from);
  if (!phone) return { handled: false, kind: "message", error: "Invalid sender phone number" };

  const limit = rateLimit("whatsapp", phone);
  if (!limit.allowed) {
    console.warn("WhatsApp sender rate limited", { sender: maskWhatsAppPhone(phone) });
    return { handled: false, kind: "message", error: "Sender rate limited" };
  }

  console.info("Incoming WhatsApp message", {
    messageId: event.messageId,
    sender: maskWhatsAppPhone(phone),
    messageType: event.messageType,
  });

  const prepared = await prepareMessage({ ...event, from: phone });
  const { store, conversation, history } = prepared;
  if (prepared.duplicate) {
    console.info("Duplicate WhatsApp message ignored", {
      messageId: event.messageId,
      conversationId: conversation.conversationId,
    });
    return { handled: true, duplicate: true, kind: "message", conversationId: conversation.conversationId };
  }
  claimedInboundMessages.set(event.messageId, {
    store,
    conversationId: conversation.conversationId,
  });

  const leadInfo = cleanLeadInfo(conversation.leadInfo);
  leadInfo.phone = formatWhatsAppPhone(phone);
  leadInfo.preferredContactMethod = "whatsapp";
  if (!leadInfo.name && conversation.contactName) {
    leadInfo.name = cleanText(conversation.contactName, 120);
  }
  const contextMessage: ChatMessage = {
    id: event.messageId,
    role: "user",
    content: event.text || `[${event.messageType} message]`,
    timestamp: event.timestamp,
  };
  const contextMessages = [...history, contextMessage].slice(-MAX_HISTORY_MESSAGES);

  const requestedHandoff = Boolean(event.text && isHumanHandoffRequest(event.text));
  const wasAlreadyInHandoff = conversation.status === "HUMAN_HANDOFF";
  if (wasAlreadyInHandoff || requestedHandoff) {
    const shouldNotify = conversation.handoffNotificationStatus !== "notified";
    let notification = {
      notificationConfigured: conversation.handoffNotificationStatus !== "not_configured",
      notified: conversation.handoffNotificationStatus === "notified",
      detail: "Handoff request is already recorded",
    };

    const handoffConversation = {
      ...conversation,
      leadInfo,
      status: "HUMAN_HANDOFF" as const,
      handoffReason: conversation.handoffReason || HANDOFF_REASON,
    };
    if (shouldNotify) {
      notification = await notifyWhatsAppHumanHandoff({
        conversation: handoffConversation,
        reason: handoffConversation.handoffReason,
        recentMessages: contextMessages.map((message) => ({ role: message.role, content: message.content })),
      });
    }

    const notificationStatus = notification.notified
      ? "notified"
      : notification.notificationConfigured
        ? "failed"
        : "not_configured";
    const saved = await persistLeadAndState(
      store,
      conversation,
      leadInfo,
      false,
      {
        status: "HUMAN_HANDOFF",
        qualificationState: "human_handoff",
        handoffReason: handoffConversation.handoffReason,
        handoffNotificationStatus: notificationStatus,
      }
    );

    const reply = notification.notified
      ? "Understood — I’ve paused the AI assistant and sent your request to the configured Vyravo AI handoff workflow. You can also call +91 9075707650 or email akshay.navale.work@gmail.com."
      : notification.notificationConfigured
        ? "Understood — I’ve paused the AI assistant and marked this conversation for human follow-up. The configured handoff workflow could not be reached, so please call +91 9075707650 or email akshay.navale.work@gmail.com to reach the team."
        : "Understood — I’ve paused the AI assistant and marked this conversation for human follow-up. No live agent notification is configured here, so please call +91 9075707650 or email akshay.navale.work@gmail.com to reach the team.";
    const sent = await sendAndLog(store, saved, { ...event, from: phone }, reply, {
      flow: "human_handoff",
      notificationStatus,
    });
    await markInboundProcessing(store, event.messageId, sent, saved.conversationId);
    await syncQualifiedLead(store, saved, leadInfo);
    return {
      handled: true,
      kind: "message",
      conversationId: saved.conversationId,
      responseSent: sent,
      aiProvider: "none",
      status: "HUMAN_HANDOFF",
    };
  }

  if (!event.text) {
    const saved = await persistLeadAndState(store, conversation, leadInfo, false, { status: "AI_ACTIVE" });
    const sent = await sendAndLog(store, saved, { ...event, from: phone }, UNSUPPORTED_MESSAGE, {
      flow: "unsupported_message_type",
    });
    await markInboundProcessing(store, event.messageId, sent, saved.conversationId);
    return {
      handled: true,
      kind: "message",
      conversationId: saved.conversationId,
      responseSent: sent,
      aiProvider: "none",
      status: "AI_ACTIVE",
    };
  }

  const message = event.text.trim().slice(0, MAX_MESSAGE_CHARS);
  const chatContext = createConversationContext(conversation, leadInfo, contextMessages);
  const historyForModel = history.slice(-MAX_HISTORY_MESSAGES).map((item) => ({
    role: item.role === "assistant" ? "assistant" as const : "user" as const,
    content: item.content.slice(0, 4000),
  }));

  let reply: string | null = null;
  let intent: string | undefined;
  let bookingRequested = false;
  let aiProvider: "openai" | "internal" = "internal";
  let degraded = false;

  console.info("WhatsApp message processing started", {
    messageId: event.messageId,
    conversationId: conversation.conversationId,
  });

  if (isOpenAIConfigured()) {
    try {
      const knowledge = await getPublicKnowledgeContext(message);
      const result = await generateOpenAIChatResponse({
        message,
        history: historyForModel,
        leadInfo,
        knowledgeContext: knowledge?.context || null,
      });
      reply = result.reply;
      intent = result.intent;
      bookingRequested = containsBookingIntent(message, result.intent, result.readyToBook);
      aiProvider = "openai";
      mergeLeadInfo(leadInfo, result.lead, result.interestLevel);
      addInterest(leadInfo, intent);
    } catch (error) {
      logOpenAIError("whatsapp.chat", error);
      degraded = true;
    }
  }

  if (!reply) {
    try {
      const kbOutcome = await tryKnowledgeBaseAnswer(message, chatContext);
      if (kbOutcome) {
        reply = kbOutcome.response;
        intent = intent || "general";
      } else {
        const result = generateResponse(message, chatContext);
        reply = result.message;
        intent = result.intent;
        bookingRequested = containsBookingIntent(message, result.intent);
        addInterest(leadInfo, intent);
      }
    } catch (error) {
      console.error("WhatsApp chatbot fallback failed", {
        conversationId: conversation.conversationId,
        error: error instanceof Error ? error.message : "unknown error",
      });
      reply = AI_FAILURE_MESSAGE;
      degraded = true;
    }
  }

  if (!reply) reply = AI_FAILURE_MESSAGE;
  // Keep the Meta sender number as the canonical WhatsApp contact key even if
  // the visitor mentions another number in a message.
  leadInfo.phone = formatWhatsAppPhone(phone);
  leadInfo.preferredContactMethod = "whatsapp";
  bookingRequested = bookingRequested || Boolean(leadInfo.discoveryCallRequested);
  if (bookingRequested) leadInfo.discoveryCallRequested = true;
  leadInfo.qualified = isQualifiedLead(leadInfo);

  let finalReply = compactWhatsAppReply(reply);
  if (bookingRequested) finalReply = compactWhatsAppReply(addBookingLink(finalReply));
  console.info("WhatsApp AI response generated", {
    conversationId: conversation.conversationId,
    aiProvider,
    degraded,
    intent: intent || "general",
  });

  const saved = await persistLeadAndState(store, conversation, leadInfo, bookingRequested, {
    status: "AI_ACTIVE",
    handoffReason: null,
  });
  const sent = await sendAndLog(store, saved, { ...event, from: phone }, finalReply, {
    flow: "ai",
    aiProvider,
    degraded,
    intent: intent || "general",
  });
  await markInboundProcessing(store, event.messageId, sent, saved.conversationId);

  // CRM is best-effort and happens after the customer response is attempted;
  // a HubSpot outage must not prevent WhatsApp from being answered.
  await syncQualifiedLead(store, saved, leadInfo);

  console.info("WhatsApp message processing completed", {
    conversationId: saved.conversationId,
    aiProvider,
    responseSent: sent,
    crmConfigured: isHubSpotConfigured(),
  });

  return {
    handled: true,
    kind: "message",
    conversationId: saved.conversationId,
    responseSent: sent,
    aiProvider,
    degraded,
    status: "AI_ACTIVE",
  };
}

const conversationLocks = new Map<string, Promise<unknown>>();

export async function processWhatsAppMessage(event: WhatsAppMessageEvent): Promise<WhatsAppProcessResult> {
  const lockKey = normalizeWhatsAppPhone(event.from);
  if (!lockKey) return { handled: false, kind: "message", error: "Invalid sender phone number" };

  const previous = conversationLocks.get(lockKey);
  const run: Promise<WhatsAppProcessResult> = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
    try {
      return await handleMessageEvent(event);
    } catch (error) {
      const claimed = claimedInboundMessages.get(event.messageId);
      if (claimed) {
        await markInboundProcessing(
          claimed.store,
          event.messageId,
          false,
          claimed.conversationId
        );
      }
      console.error("WhatsApp message processing error", {
        messageId: event.messageId,
        sender: maskWhatsAppPhone(event.from),
        error: error instanceof Error ? error.message : "unknown error",
      });
      return {
        handled: false,
        kind: "message" as const,
        error: "Message processing failed",
      };
    }
  });

  let tracked: Promise<WhatsAppProcessResult>;
  tracked = run.finally(() => {
    if (conversationLocks.get(lockKey) === tracked) conversationLocks.delete(lockKey);
  });
  conversationLocks.set(lockKey, tracked);
  return run;
}

export async function processWhatsAppStatus(event: WhatsAppStatusEvent): Promise<WhatsAppProcessResult> {
  try {
    const store = getWhatsAppStore();
    await store.updateMessageStatus(event.messageId, event.status, event.timestamp);
    console.info("WhatsApp message status updated", {
      providerMessageId: event.messageId,
      status: event.status,
    });
    return { handled: true, kind: "status" };
  } catch (error) {
    console.error("WhatsApp status update failed", {
      providerMessageId: event.messageId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return { handled: false, kind: "status", error: "Status update failed" };
  }
}

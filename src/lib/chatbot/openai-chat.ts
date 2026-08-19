// Vyravo AI chatbot ↔ OpenAI (Responses API + Structured Outputs).
//
// SERVER-ONLY. Imported by /api/chat and by the provider router — never by a
// client component.
//
// Why structured outputs: a single OpenAI call returns BOTH the visitor-facing
// reply AND the qualification fields we extract from the conversation. That
// keeps latency and cost down (no second "extraction" call) and feeds the
// EXISTING HubSpot sync + discovery-call booking flow rather than duplicating
// them.

import {
  getChatModel,
  getOpenAIClient,
  modelSupportsTemperature,
} from "@/lib/openai/client";
import { SYSTEM_PROMPT } from "./system-prompt";
import { COMPANY_KNOWLEDGE } from "./knowledge";
import { SITE_LINKS } from "../constants";
import type { LeadInfo } from "./types";

/** Max tokens for a chat reply — chat answers must stay short. */
const MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_CHAT_MAX_TOKENS) || 700;

/** How many prior turns to send. Bounds cost and prompt size. */
export const MAX_HISTORY_TURNS = 12;

export interface OpenAIChatInput {
  /** The visitor's current message (already validated + trimmed). */
  message: string;
  /** Prior turns, oldest first, EXCLUDING the current message. */
  history: { role: "user" | "assistant"; content: string }[];
  /** What we already know about this lead, so the model doesn't re-ask. */
  leadInfo: LeadInfo;
  /** Approved PUBLIC Knowledge Base passages, when any matched. */
  knowledgeContext?: string | null;
}

export interface ExtractedLead {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  businessSize: string | null;
  mainProblem: string | null;
  currentWorkflow: string | null;
  desiredOutcome: string | null;
}

export interface OpenAIChatResult {
  reply: string;
  intent: string;
  interestLevel: "low" | "medium" | "high" | "unknown";
  readyToBook: boolean;
  lead: ExtractedLead;
  model: string;
  usedKnowledgeBase: boolean;
}

const INTENTS = [
  "greeting",
  "services",
  "pricing",
  "industries",
  "process",
  "booking",
  "contact",
  "integration",
  "support",
  "comparison",
  "objection",
  "qualification",
  "thanks",
  "goodbye",
  "unknown",
  "general",
] as const;

/** Strict JSON Schema — the model must return exactly this shape. */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "intent", "interest_level", "ready_to_book", "lead"],
  properties: {
    reply: {
      type: "string",
      description:
        "The message shown to the visitor. Markdown allowed. Concise: at most ~120 words.",
    },
    intent: { type: "string", enum: [...INTENTS] },
    interest_level: { type: "string", enum: ["low", "medium", "high", "unknown"] },
    ready_to_book: {
      type: "boolean",
      description:
        "True ONLY when the visitor has expressed clear intent to book/schedule a discovery call.",
    },
    lead: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "email",
        "phone",
        "company",
        "industry",
        "business_size",
        "main_problem",
        "current_workflow",
        "desired_outcome",
      ],
      properties: {
        name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        industry: { type: ["string", "null"] },
        business_size: { type: ["string", "null"] },
        main_problem: { type: ["string", "null"] },
        current_workflow: { type: ["string", "null"] },
        desired_outcome: { type: ["string", "null"] },
      },
      description:
        "Facts the visitor ACTUALLY stated in this conversation. Never guess or infer; use null when not stated.",
    },
  },
} as const;

function describeKnownLead(leadInfo: LeadInfo): string {
  const known: string[] = [];
  if (leadInfo.name) known.push(`name: ${leadInfo.name}`);
  if (leadInfo.company) known.push(`company: ${leadInfo.company}`);
  if (leadInfo.industry) known.push(`industry: ${leadInfo.industry}`);
  if (leadInfo.companySize) known.push(`business size: ${leadInfo.companySize}`);
  if (leadInfo.email) known.push(`email: ${leadInfo.email}`);
  if (leadInfo.phone) known.push(`phone: ${leadInfo.phone}`);
  if (leadInfo.challenges?.length) known.push(`challenges: ${leadInfo.challenges.join("; ")}`);
  if (leadInfo.desiredOutcome) known.push(`desired outcome: ${leadInfo.desiredOutcome}`);
  if (leadInfo.currentWorkflow) known.push(`current workflow: ${leadInfo.currentWorkflow}`);
  if (leadInfo.timeline) known.push(`timeline: ${leadInfo.timeline}`);

  return known.length
    ? `ALREADY KNOWN ABOUT THIS VISITOR (never ask for these again):\n${known.map((k) => `- ${k}`).join("\n")}`
    : "ALREADY KNOWN ABOUT THIS VISITOR: nothing yet.";
}

function buildInstructions(input: OpenAIChatInput): string {
  const parts: string[] = [SYSTEM_PROMPT];

  if (input.knowledgeContext) {
    parts.push(
      `## APPROVED KNOWLEDGE BASE EXCERPTS (authoritative — prefer these over general knowledge)
${input.knowledgeContext}

Never mention "knowledge base", "sources", "excerpts" or citation markers like [1] to the visitor.`
    );
  }

  parts.push(`## GROUNDING RULES (STRICT — these override everything above)
1. The company information in this prompt is the ONLY source of truth. If something is not stated here, you DO NOT know it.
2. NEVER invent prices, discounts, testimonials, client names, case-study results, guarantees, SLAs, certifications, delivery dates, or capabilities.
3. If you do not know something, say so plainly and offer a free discovery call or the contact details (${COMPANY_KNOWLEDGE.contact.phone} / ${COMPANY_KNOWLEDGE.contact.email}).
4. Any statistic you mention must be labelled as illustrative, exactly as it is written in this prompt.
5. Booking link (the ONLY booking URL you may give): ${SITE_LINKS.discoveryCall}

## CONVERSATION RULES
1. Keep replies short — under ~120 words. No walls of text. Markdown bullets are fine.
2. Ask AT MOST ONE question per reply, and only when it genuinely helps. This is a conversation, not a form.
3. Never re-ask for information already known (listed below).
4. Qualify naturally over several turns: industry → main problem → current workflow → desired outcome → size → contact details.
5. Suggest the discovery call when the visitor shows real interest — never on every message, and never pushily.
6. Set ready_to_book=true ONLY on clear booking intent ("book a call", "let's schedule", "how do I get started with a call").

## EXTRACTION RULES
Populate the lead object ONLY with facts the visitor explicitly stated in this conversation. Use null for anything not stated. Do not infer a company from an email domain, or a size from vague words.

${describeKnownLead(input.leadInfo)}`);

  return parts.join("\n\n");
}

interface RawModelOutput {
  reply?: unknown;
  intent?: unknown;
  interest_level?: unknown;
  ready_to_book?: unknown;
  lead?: Record<string, unknown>;
}

function cleanString(value: unknown, maxLen = 400): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "unknown") return null;
  return trimmed.slice(0, maxLen);
}

/** Strip ```json fences some models add around structured output. */
function stripCodeFences(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text;
}

function parseResult(text: string, model: string, usedKb: boolean): OpenAIChatResult {
  let raw: RawModelOutput;
  try {
    raw = JSON.parse(stripCodeFences(text)) as RawModelOutput;
  } catch {
    // Structured outputs make this near-impossible. Rather than show a visitor
    // an unvalidated blob, fail so the caller degrades to the curated engine.
    throw new Error("OpenAI returned output that did not match the response schema");
  }

  const reply = typeof raw.reply === "string" ? raw.reply.trim() : "";
  if (!reply) throw new Error("OpenAI returned an empty reply");

  const leadRaw = (raw.lead || {}) as Record<string, unknown>;

  return {
    reply,
    intent: typeof raw.intent === "string" ? raw.intent : "general",
    interestLevel:
      raw.interest_level === "low" || raw.interest_level === "medium" || raw.interest_level === "high"
        ? raw.interest_level
        : "unknown",
    readyToBook: raw.ready_to_book === true,
    lead: {
      name: cleanString(leadRaw.name, 120),
      email: cleanString(leadRaw.email, 200),
      phone: cleanString(leadRaw.phone, 50),
      company: cleanString(leadRaw.company, 160),
      industry: cleanString(leadRaw.industry, 120),
      businessSize: cleanString(leadRaw.business_size, 80),
      mainProblem: cleanString(leadRaw.main_problem, 500),
      currentWorkflow: cleanString(leadRaw.current_workflow, 500),
      desiredOutcome: cleanString(leadRaw.desired_outcome, 500),
    },
    model,
    usedKnowledgeBase: usedKb,
  };
}

/**
 * Ask OpenAI for the next chatbot turn.
 *
 * Throws on any provider failure — the caller decides how to degrade
 * (the /api/chat route falls back to the deterministic engine).
 */
export async function generateOpenAIChatResponse(
  input: OpenAIChatInput
): Promise<OpenAIChatResult> {
  const client = getOpenAIClient();
  const model = getChatModel();

  const history = input.history.slice(-MAX_HISTORY_TURNS).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const response = await client.responses.create({
    model,
    instructions: buildInstructions(input),
    input: [...history, { role: "user" as const, content: input.message }],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    ...(modelSupportsTemperature(model) ? { temperature: 0.4 } : {}),
    text: {
      format: {
        type: "json_schema",
        name: "vyravo_chat_turn",
        strict: true,
        schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  if (response.status === "incomplete") {
    // Truncated (token cap) — the JSON is unusable.
    throw new Error(
      `OpenAI response incomplete: ${response.incomplete_details?.reason ?? "unknown reason"}`
    );
  }

  return parseResult(response.output_text ?? "", model, Boolean(input.knowledgeContext));
}

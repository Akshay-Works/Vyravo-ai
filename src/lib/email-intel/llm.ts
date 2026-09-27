// ============================================================================
// EMAIL INTELLIGENCE — one LLM call per inbound email: understand meaning +
// context, classify, extract people, draft the reply. Single JSON call keeps
// cost ≈ $0.0005/email on gpt-4o-mini. Returns null on ANY failure (missing
// key, timeout, bad JSON) — the pipeline routes those to human review, it
// never guesses and never blocks the cron.
// ============================================================================
import { getOpenAIClient, isOpenAIConfigured, getChatModel, modelSupportsTemperature } from "@/lib/openai/client";

export type IntelClass =
  | "positive_interest" | "meeting_request" | "question" | "pricing_request"
  | "referral" | "introduction" | "not_interested" | "unsubscribe"
  | "out_of_office" | "job_recruitment" | "general" | "spam" | "requires_human_review";

export interface IntelEntity {
  email: string; name?: string | null; title?: string | null; company?: string | null;
  phone?: string | null; linkedin?: string | null;
  relationship?: string | null; reason?: string | null;
  confidence: number; recommended_action: "contact" | "review" | "ignore";
}

export interface IntelAnalysis {
  classification: IntelClass;
  confidence: number;
  reply_required: boolean;
  sender_is_lead: boolean;
  is_referral: boolean;
  new_contact_recommended: boolean;
  entities: IntelEntity[];
  draft: { subject: string; body: string } | null;
  safety_flags: string[];
  explanation: string;
}

export interface IntelContext {
  fromEmail: string; fromName?: string | null;
  subject: string; body: string;
  priorThread: string; // our sent outreach + earlier inbound, condensed
  leadFacts: Record<string, string>;
}

const SYSTEM = [
  "You are Vyravo AI's email intelligence. Vyravo AI (vyravo.ai) implements practical AI automation for small businesses: AI receptionists, automated follow-ups, lead handling, review/WhatsApp automation, and reporting — live and working, not demos.",
  "Understand MEANING and CONTEXT, not keywords. Read the whole thread.",
  "Rules:",
  "1. classification: exactly one of positive_interest, meeting_request, question, pricing_request, referral, introduction, not_interested, unsubscribe, out_of_office, job_recruitment, general, spam, requires_human_review.",
  "2. confidence 0..1 on the classification. reply_required true only if a human would expect an answer (never for unsubscribe/ooo/spam/not_interested).",
  "3. is_referral true when the sender redirects you to another person (senior, colleague, decision-maker, replacement contact). A mere CC or signature address is NOT a referral.",
  "4. entities: every email address in the message with name/title/company if stated or obvious, relationship to the sender, why contact may matter, confidence, and recommended_action (contact only for genuine referral/introduction/replacement targets you are SURE about; review when plausible; ignore for CCs, signatures, noreply/system addresses).",
  "5. draft: a reply to THIS sender using full context (prior outreach + thread + lead facts). Concise, professional, human, personalized, direct, not salesy, no generic AI wording ('I hope this email finds you well', 'delve', 'game-changer' are banned). If referral: thank them and acknowledge connecting with the referred person. If question/pricing: answer ONLY from provided facts; if facts are missing, offer a 15-min call instead of inventing. draft null when reply_required is false.",
  "6. safety_flags: any of uncertain_recipient, legal_sensitive, confidential_content, complaint_escalation, relationship_risk, unclear_request. Empty array when none.",
  "7. explanation: ONE short sentence on why you decided this. No chain-of-thought, no reasoning trace.",
  'Respond ONLY with JSON: {"classification","confidence","reply_required","sender_is_lead","is_referral","new_contact_recommended","entities":[{"email","name","title","company","phone","linkedin","relationship","reason","confidence","recommended_action"}],"draft":{"subject","body"}|null,"safety_flags":[],"explanation"}.',
].join("\n");

const CLASSES: IntelClass[] = ["positive_interest", "meeting_request", "question", "pricing_request",
  "referral", "introduction", "not_interested", "unsubscribe", "out_of_office", "job_recruitment",
  "general", "spam", "requires_human_review"];

function sanitize(raw: any): IntelAnalysis | null {
  try {
    if (!raw || !CLASSES.includes(raw.classification)) return null;
    const conf = Number(raw.confidence);
    const entities: IntelEntity[] = Array.isArray(raw.entities) ? raw.entities
      .filter((e: any) => e && typeof e.email === "string" && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(e.email.trim()))
      .slice(0, 10)
      .map((e: any) => ({
        email: e.email.trim().toLowerCase(),
        name: typeof e.name === "string" ? e.name.slice(0, 120) || null : null,
        title: typeof e.title === "string" ? e.title.slice(0, 120) || null : null,
        company: typeof e.company === "string" ? e.company.slice(0, 160) || null : null,
        phone: typeof e.phone === "string" ? e.phone.slice(0, 40) || null : null,
        linkedin: typeof e.linkedin === "string" ? e.linkedin.slice(0, 240) || null : null,
        relationship: typeof e.relationship === "string" ? e.relationship.slice(0, 200) || null : null,
        reason: typeof e.reason === "string" ? e.reason.slice(0, 300) || null : null,
        confidence: Math.min(Math.max(Number(e.confidence) || 0, 0), 1),
        recommended_action: ["contact", "review", "ignore"].includes(e.recommended_action) ? e.recommended_action : "review",
      })) : [];
    let draft: IntelAnalysis["draft"] = null;
    if (raw.draft && typeof raw.draft.subject === "string" && typeof raw.draft.body === "string"
        && raw.draft.body.trim().length >= 20 && raw.draft.body.length <= 4000) {
      draft = { subject: raw.draft.subject.slice(0, 200), body: raw.draft.body.slice(0, 4000) };
    }
    return {
      classification: raw.classification,
      confidence: Math.min(Math.max(conf || 0, 0), 1),
      reply_required: raw.reply_required === true,
      sender_is_lead: raw.sender_is_lead !== false,
      is_referral: raw.is_referral === true,
      new_contact_recommended: raw.new_contact_recommended === true,
      entities,
      draft,
      safety_flags: Array.isArray(raw.safety_flags) ? raw.safety_flags.filter((f: any) => typeof f === "string").slice(0, 8) : [],
      explanation: String(raw.explanation || "").slice(0, 300),
    };
  } catch {
    return null;
  }
}

export async function analyzeEmail(ctx: IntelContext): Promise<IntelAnalysis | null> {
  if (!isOpenAIConfigured()) return null;
  const user = [
    `FROM: ${ctx.fromName ? `${ctx.fromName} <${ctx.fromEmail}>` : ctx.fromEmail}`,
    `SUBJECT: ${ctx.subject}`.slice(0, 300),
    `MESSAGE:\n${ctx.body}`.slice(0, 3200),
    ctx.priorThread ? `PRIOR THREAD (our outreach + earlier messages, oldest first):\n${ctx.priorThread}`.slice(0, 2200) : "",
    `LEAD FACTS (only these are true; never invent): ${JSON.stringify(ctx.leadFacts)}`.slice(0, 1200),
  ].filter(Boolean).join("\n\n");
  try {
    const model = getChatModel();
    const res = await getOpenAIClient().chat.completions.create({
      model,
      ...(modelSupportsTemperature(model) ? { temperature: 0.3 } : {}),
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const text = res.choices?.[0]?.message?.content || "";
    return sanitize(JSON.parse(text));
  } catch (e) {
    console.error("inbox LLM analysis failed (→ human review):", e instanceof Error ? e.message : e);
    return null;
  }
}

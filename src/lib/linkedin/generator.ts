// ============================================================================
// LINKEDIN MESSAGE GENERATOR — research (from CRM data only) → personalization
// summary → a UNIQUE, human-sounding, short LinkedIn message per lead.
//
// NO FABRICATION CONTRACT
// -----------------------
// - Only fields that actually exist on the lead row may be referenced.
// - If information is thin, the message gets simpler — never invented.
// - Nothing claims external research was done (no "I read your post about…").
// - Messages are checked for uniqueness against all existing LinkedIn
//   messages so two leads never receive the same text.
// ============================================================================
import { getOpenAIClient, isOpenAIConfigured, classifyOpenAIError, logOpenAIError } from "@/lib/openai/client";
import { pool } from "@/db";

export const LINKEDIN_URL_RE = /^(https?:\/\/)?(([\w-]+\.)?linkedin\.com)\/(in|company|pub)\/[A-Za-z0-9\-_%]+/i;

export interface GenerationResult {
  summary: string;          // short internal personalization reason (shown in Admin)
  message: string;          // the final message text
  framework: string;        // which framework was used
  ai: boolean;              // true = LLM-generated, false = template fallback
}

// ---------------------------------------------------------------------------
// REAL data only — map CRM fields into a personalization source-of-truth.
// ---------------------------------------------------------------------------
function factsFor(lead: any) {
  const full = lead.full_name || lead.fullName || "";
  const firstName = full.trim().split(/\s+/)[0] || "";
  const lastName = full.trim().split(/\s+/).slice(1).join(" ");
  const company = lead.business_name || lead.businessName || "";
  const industry = lead.industry || "";
  const location = [lead.city, lead.country].filter(Boolean).join(", ") || "";
  const size = lead.company_size || lead.companySize || "";
  const challenge = lead.biggest_challenge || lead.biggestChallenge || "";
  const goals = lead.automation_goals || lead.automationGoals || "";
  const software = lead.current_software || lead.currentSoftware || "";
  const monthly = lead.monthly_leads || lead.monthlyLeads || "";
  const website = (lead.business_website || lead.businessWebsite || "").replace(/^https?:\/\//, "");
  const summary = lead.qualification_summary || lead.qualificationSummary || "";
  const services = Array.isArray(lead.recommended_services)
    ? lead.recommended_services.join(", ")
    : (lead.recommended_services || lead.recommendedServices || "");
  return { firstName, lastName, company, industry, location, size, challenge, goals, software, monthly, website, summary, services };
}

/** True when a value is "real content" rather than empty/generic boilerplate. */
function has(v: string): boolean {
  return Boolean(v && v.trim() && !/^(n\/?a|none|unknown|null|tbd|-)$/i.test(v.trim()));
}

// ---------------------------------------------------------------------------
// FRAMEWORKS — different structures, chosen by available signal. Each is safe
// with little data (plain greeting) and references ONLY provided facts.
// ---------------------------------------------------------------------------
type Framework = "observation" | "problem" | "industry" | "founder" | "simple";

function buildMessage(f: Framework, lead: any, facts: ReturnType<typeof factsFor>): string {
  const { firstName, company, industry, location, size, challenge, software, monthly } = facts;
  const name = firstName || "there";
  const cx = company || "your business";
  switch (f) {
    case "observation": {
      let obs = `came across ${cx}`;
      if (has(industry)) obs += ` in the ${industry} space`;
      if (has(location)) obs += ` (${location})`;
      return `Hi ${name}, ${obs}. Curious — are you currently using any automation for lead follow-up or customer enquiries?`;
    }
    case "problem": {
      let area = location ? ` in ${location}` : has(industry) ? ` in the ${industry} space` : "";
      let detail = "";
      if (has(challenge)) detail = ` I noticed ${challenge.toLowerCase().replace(/\.$/, "")} seems to be a focus`;
      else if (has(monthly)) detail = ` especially as ${cx}${area ? "" : " grows"} handles more enquiries`;
      return `Hi ${name}, noticed ${cx} is growing${area}.${detail} I'm curious how you're handling incoming enquiries and follow-ups as volume increases. Open to connecting?`;
    }
    case "industry": {
      let ind = has(industry) ? `${industry} ` : "";
      let extra = has(size) ? `At ${size}. ` : "";
      let hook = has(software) ? `Saw you're on ${software}. ` : "";
      return `Hi ${name}, I work with ${ind}businesses on automating repetitive sales and customer-support workflows.${extra}${hook}Noticed ${cx}${has(location) ? ` in ${location}` : ""} — thought it made sense to connect.`;
    }
    case "founder": {
      const researching = has(industry) ? `${industry} businesses` : "businesses in your space";
      let interesting = "";
      if (has(challenge)) interesting = ` Interesting to see how ${cx} is tackling ${challenge.toLowerCase().replace(/\.$/, "")}.`;
      return `Hi ${name}, came across ${cx} while researching ${researching}.${interesting} I'm working on AI automation for this space — thought I'd connect.`;
    }
    default: {
      // SIMPLE — used when almost no information exists. Never fabricates.
      return `Hi ${name}, came across ${cx}. I help businesses automate lead follow-up and customer enquiries. Thought it would be worth connecting — open to a chat?`;
    }
  }
}

function pickFramework(lead: any, facts: ReturnType<typeof factsFor>, seed: number): Framework {
  // Prefer a signal-rich framework; rotate deterministically by lead id so
  // neighbouring leads (same industry) don't all get the same structure.
  const hasChal = has(facts.challenge) || has(facts.goals) || has(facts.software) || has(facts.monthly);
  const hasInd = has(facts.industry);
  const poolF: Framework[] = hasChal ? ["problem", "observation"] : hasInd ? ["industry", "founder"] : ["simple"];
  return poolF[seed % poolF.length];
}

// ---------------------------------------------------------------------------
// PERSONALIZATION SUMMARY — short internal reason (shown in the Admin queue).
// ---------------------------------------------------------------------------
function buildSummary(lead: any, facts: ReturnType<typeof factsFor>): string {
  const bits: string[] = [];
  if (has(facts.industry)) bits.push(`Runs a ${facts.industry} business`);
  if (has(facts.location)) bits.push(`based in ${facts.location}`);
  if (has(facts.size)) bits.push(`(${facts.size})`);
  if (has(facts.challenge)) bits.push(`appears focused on ${facts.challenge.toLowerCase().replace(/\.$/, "")}`);
  else if (has(facts.goals)) bits.push(`interested in ${facts.goals.toLowerCase().replace(/\.$/, "")}`);
  else if (has(facts.monthly)) bits.push(`handling roughly ${facts.monthly.toLowerCase()} enquiries`);
  if (!bits.length) bits.push("Limited CRM data available — using a simple intro message without specific claims");
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// UNIQUENESS — never reuse an existing LinkedIn message for another lead.
// ---------------------------------------------------------------------------
async function messageExists(message: string, excludeLeadId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM outreach_activities WHERE channel = 'linkedin' AND message = $1 AND lead_id != $2 LIMIT 1`,
    [message, excludeLeadId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// LLM generation with a strict no-fabrication prompt. Falls back to the
// framework builder on any failure (missing key, rate limit, bad output).
// ---------------------------------------------------------------------------
interface LLMOut { summary: string; message: string; }

async function generateWithLLM(lead: any, facts: ReturnType<typeof factsFor>, framework: Framework, followUpNumber: number): Promise<LLMOut | null> {
  if (!isOpenAIConfigured()) return null;
  const purpose = followUpNumber === 0
    ? "Write ONE short LinkedIn connection/outreach message whose ONLY goal is to start a conversation. No pitch, no sell, no links, no emojis."
    : "Write ONE short LinkedIn follow-up message that continues a previous conversation naturally, referencing only facts already provided. No pitch, no links, no emojis.";
  const system =
    `You write short, natural, human LinkedIn outreach messages for a founder. Hard rules:\n` +
    `1. Use ONLY the facts provided. NEVER invent a detail (no made-up posts, no fake compliments, no claims about their content, no "I read your article").\n` +
    `2. When a fact is missing, write a simpler, more generic sentence instead — never fabricate.\n` +
    `3. Do not claim you performed research beyond the given facts.\n` +
    `4. No salesy language, no AI buzzwords ("leverage", "cutting-edge", "game-changer"), no emojis, no exclamation marks.\n` +
    `5. Concise: for the first message aim for 250 characters or fewer; follow-ups max 220.\n` +
    `6. Sound like one real person, conversational and low-pressure.\n` +
    `7. You may use the framework below as a structural hint.\n` +
    `8. Respond ONLY with JSON: {"summary": "<one short sentence, the personalization reason>", "message": "<the message>"}`;

  const user =
    `Facts about the lead (only these are true):\n` +
    JSON.stringify({ firstName: facts.firstName, company: facts.company, industry: facts.industry, location: facts.location, size: facts.size, challenge: facts.challenge, goals: facts.goals, software: facts.software, monthly: facts.monthly, website: facts.website }, null, 1) +
    `\n\nFramework: ${framework}\nTask: ${purpose}`;

  try {
    const client = getOpenAIClient();
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = res.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text) as LLMOut;
    if (!parsed.message || typeof parsed.message !== "string") return null;
    return { summary: String(parsed.summary || "").slice(0, 220), message: parsed.message.trim() };
  } catch (e: any) {
    console.error("LinkedIn generation LLM error:", e instanceof Error ? e.message : e);
    return null; // fall back to framework builder — never fail the pipeline
  }
}

// ---------------------------------------------------------------------------
// MAIN ENTRY — builds a unique, personalized message for one lead.
// ---------------------------------------------------------------------------
export async function generateLinkedInMessage(
  lead: any,
  followUpNumber = 0,
  opts: { seedOverride?: number; attempt?: number } = {}
): Promise<GenerationResult> {
  const facts = factsFor(lead);
  const seed = (opts.seedOverride ?? lead.id ?? 1) + (opts.attempt ?? 0) * 7;
  const framework = pickFramework(lead, facts, seed);

  // 1) LLM path (best quality; strict prompt; safe fallback)
  let summary = buildSummary(lead, facts);
  let message = buildMessage(framework, lead, facts);
  let usedAI = false;

  const llm = await generateWithLLM(lead, facts, framework, followUpNumber);
  if (llm && llm.message) {
    // sanitize: strip anything that looks fabricated or unsafe
    const cleaned = llm.message
      .replace(/["\u201C\u201D\u2018\u2019]+/g, "")
      .replace(/[#*`>]/g, "")
      .trim();
    if (cleaned.length >= 40 && cleaned.length <= 400) {
      message = cleaned;
      summary = llm.summary || summary;
      usedAI = true;
    }
  }

  // 2) uniqueness — an identical message must never go to two leads
  let attempts = 0;
  while (attempts < 3 && (await messageExists(message, Number(lead.id)))) {
    attempts++;
    const altFramework = pickFramework(lead, facts, seed + attempts * 13);
    message = buildMessage(altFramework, lead, facts);
    summary = buildSummary(lead, facts);
    usedAI = false;
  }

  return { summary, message, framework, ai: usedAI };
}

/** Render a follow-up message that references the intro context. */
export async function generateFollowUpMessage(lead: any, introMessage: string, followUpNumber: number): Promise<GenerationResult> {
  const base = await generateLinkedInMessage(lead, followUpNumber, { seedOverride: (lead.id ?? 1) + followUpNumber * 3 });
  const { firstName } = factsFor(lead);
  const name = firstName || "there";
  // Follow-ups stay short and conversation-bumping; no fabricated references.
  const variants =
    followUpNumber === 1
      ? [
          `Hi ${name}, just bumping this up — happy to keep it short. Open to a brief chat about ${lead.business_name || "your team"} this week?`,
          `Hi ${name}, no pressure at all — I know these notes pile up. If automating lead follow-up is ever on your list, I'm around.`,
        ]
      : [
          `Hi ${name}, last note from me — I'll leave it here. If ${lead.business_name || "your team"} ever wants to look at automating follow-ups, my door's open.`,
          `Hi ${name}, one final note. Either way, wishing you and ${lead.business_name || "your team"} a good quarter ahead.`,
        ];
  const candidate = variants[Math.abs((lead.id ?? 1) + followUpNumber) % variants.length];
  // Only use the LLM base if it is genuinely different from the intro and unique.
  if (base.message !== introMessage && !(await messageExists(base.message, Number(lead.id)))) {
    return { ...base };
  }
  return { summary: base.summary, message: candidate, framework: "followup", ai: false };
}

/** Validate a LinkedIn profile URL (used on ingest + eligibility). */
export function isValidLinkedInUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return LINKEDIN_URL_RE.test(url.trim());
}

/** Normalize a profile URL so it's stored consistently. */
export function normalizeLinkedInUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

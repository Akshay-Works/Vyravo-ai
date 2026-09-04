// ============================================================================
// WHATSAPP MESSAGE GENERATOR — real CRM facts only → short personalization
// summary → a UNIQUE, short, human WhatsApp message per lead.
//
// NO FABRICATION CONTRACT (same as email + LinkedIn outreach):
// • only fields that actually exist on the lead row may be referenced;
// • thin data → simpler message, never invented facts;
// • uniqueness enforced against every other WhatsApp message on record;
// • short by design (WhatsApp = quick read): intro ≤ ~240 chars where possible.
// ============================================================================
import { getOpenAIClient, isOpenAIConfigured } from "@/lib/openai/client";
import { pool } from "@/db";

export interface WhatsAppGenResult {
  summary: string;
  message: string;
  framework: string;
  ai: boolean;
}

function factsFor(lead: any) {
  const full = lead.full_name || lead.fullName || "";
  const firstName = full.trim().split(/\s+/)[0] || "";
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
  return { firstName, company, industry, location, size, challenge, goals, software, monthly, website, summary, services };
}

function has(v: string): boolean {
  return Boolean(v && v.trim() && !/^(n\/?a|none|unknown|null|tbd|-)$/i.test(v.trim()));
}

type Framework = "observation" | "problem" | "industry" | "founder" | "simple";

function buildMessage(f: Framework, lead: any, facts: ReturnType<typeof factsFor>): string {
  const { firstName, company, industry, location } = facts;
  const name = firstName || "there";
  const cx = company || "your business";
  switch (f) {
    case "observation": {
      let obs = `came across ${cx}`;
      if (has(industry)) obs += ` (${industry})`;
      if (has(location)) obs += `, ${location}`;
      return `Hi ${name}, ${obs}. I work with businesses on automating enquiries and follow-ups. Curious how you're handling that side of things?`;
    }
    case "problem":
      return `Hi ${name}, quick one — how are you currently handling new enquiries and follow-ups at ${cx}? I've been helping businesses automate parts of that and thought it might be relevant.`;
    case "industry": {
      const ind = has(industry) ? `${industry} ` : "";
      return `Hi ${name}, I work with ${ind}businesses on AI-powered support and enquiry automation. Came across ${cx} and thought it made sense to reach out.`;
    }
    case "founder": {
      const ind = has(industry) ? industry : "your space";
      return `Hi ${name}, came across ${cx} while researching businesses in ${ind}. I build automation that reduces repetitive sales/support work — thought I'd reach out.`;
    }
    default:
      return `Hi ${name}, came across ${cx}. I help businesses automate enquiry handling and follow-ups — open to a quick chat?`;
  }
}

function pickFramework(lead: any, facts: ReturnType<typeof factsFor>, seed: number): Framework {
  const hasSig = has(facts.challenge) || has(facts.goals) || has(facts.software) || has(facts.monthly) || has(facts.summary);
  const poolF: Framework[] = hasSig ? ["problem", "observation"] : has(facts.industry) ? ["industry", "founder"] : ["simple"];
  return poolF[seed % poolF.length];
}

function buildSummary(lead: any, facts: ReturnType<typeof factsFor>): string {
  const bits: string[] = [];
  if (has(facts.industry)) bits.push(`${facts.industry} business`);
  if (has(facts.location)) bits.push(`based in ${facts.location}`);
  if (has(facts.size)) bits.push(`(${facts.size})`);
  if (has(facts.challenge)) bits.push(`likely relevant for ${facts.challenge.toLowerCase().replace(/\.$/, "")}`);
  else if (has(facts.goals)) bits.push(`interested in ${facts.goals.toLowerCase().replace(/\.$/, "")}`);
  if (!bits.length) bits.push("limited data on file — using a simple, safe intro without specific claims");
  return bits.join("; ").replace(/\s+/g, " ").trim();
}

async function messageExists(message: string, excludeLeadId: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM outreach_activities WHERE channel = 'whatsapp' AND message = $1 AND lead_id != $2 LIMIT 1`,
    [message, excludeLeadId]
  );
  return (r.rowCount ?? 0) > 0;
}

interface LLMOut { summary: string; message: string; }

async function generateWithLLM(lead: any, facts: ReturnType<typeof factsFor>, framework: Framework, followUpNumber: number): Promise<LLMOut | null> {
  if (!isOpenAIConfigured()) return null;
  const purpose = followUpNumber === 0
    ? "Write ONE short WhatsApp message whose ONLY goal is to start a conversation. No pitch, no links, no emojis."
    : "Write ONE short WhatsApp follow-up that continues a conversation naturally, referencing only facts provided. No pitch, no links, no emojis.";
  const system =
    `You write short, natural, human WhatsApp outreach messages. Hard rules:\n` +
    `1. Use ONLY the facts provided. NEVER invent a detail (no fake compliments, no claims about their content/posts).\n` +
    `2. When facts are missing, write a simpler generic sentence — never fabricate.\n` +
    `3. No "Dear Sir/Madam", no corporate jargon, no buzzwords, no excessive emojis (none), no exclamation marks.\n` +
    `4. Short and conversational: intro ≤ 240 characters where practical, follow-up ≤ 220.\n` +
    `5. Low-pressure; the goal is to start a conversation, not to sell.\n` +
    `6. Use the given framework as a structural hint.\n` +
    `7. Respond ONLY with JSON: {"summary": "<one sentence personalization reason>", "message": "<the message>"}`;
  const user =
    `Facts about the lead (only these are true):\n` +
    JSON.stringify({ firstName: facts.firstName, company: facts.company, industry: facts.industry, location: facts.location, size: facts.size, challenge: facts.challenge, goals: facts.goals, software: facts.software, monthly: facts.monthly, website: facts.website }) +
    `\n\nFramework: ${framework}\nTask: ${purpose}`;
  try {
    const client = getOpenAIClient();
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.9,
      max_tokens: 280,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = res.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text) as LLMOut;
    if (!parsed.message || typeof parsed.message !== "string") return null;
    return { summary: String(parsed.summary || "").slice(0, 200), message: parsed.message.trim() };
  } catch (e) {
    console.error("WhatsApp generation LLM error:", e instanceof Error ? e.message : e);
    return null; // fall back to framework builder — pipeline never fails
  }
}

export async function generateWhatsAppMessage(lead: any, followUpNumber = 0, opts: { seedOverride?: number; attempt?: number } = {}): Promise<WhatsAppGenResult> {
  const facts = factsFor(lead);
  const seed = (opts.seedOverride ?? lead.id ?? 1) + (opts.attempt ?? 0) * 7;
  const framework = pickFramework(lead, facts, seed);
  let summary = buildSummary(lead, facts);
  let message = buildMessage(framework, lead, facts);
  let ai = false;

  const llm = await generateWithLLM(lead, facts, framework, followUpNumber);
  if (llm && llm.message) {
    const cleaned = llm.message
      .replace(/["\u201C\u201D\u2018\u2019]+/g, "")
      .replace(/[#*`>]/g, "")
      .trim();
    if (cleaned.length >= 30 && cleaned.length <= 350) {
      message = cleaned;
      summary = llm.summary || summary;
      ai = true;
    }
  }

  let attempts = 0;
  while (attempts < 3 && (await messageExists(message, Number(lead.id)))) {
    attempts++;
    const altFramework = pickFramework(lead, facts, seed + attempts * 13);
    message = buildMessage(altFramework, lead, facts);
    summary = buildSummary(lead, facts);
    ai = false;
  }
  return { summary, message, framework, ai };
}

export async function generateWhatsAppFollowUp(lead: any, introMessage: string, followUpNumber: number): Promise<WhatsAppGenResult> {
  const base = await generateWhatsAppMessage(lead, followUpNumber, { seedOverride: (lead.id ?? 1) + followUpNumber * 3 });
  const { firstName } = factsFor(lead);
  const name = firstName || "there";
  const cx = lead.business_name || "your team";
  const variants =
    followUpNumber === 1
      ? [
          `Hi ${name}, just following up on my earlier note. Worth a quick chat about automating enquiries at ${cx}?`,
          `Hi ${name}, no pressure — I know these pile up. If automating follow-ups at ${cx} is ever on your list, happy to share ideas.`,
        ]
      : [
          `Hi ${name}, one last note from me — I'll leave it here. If ${cx} ever wants automation help for enquiries and follow-ups, my door's open.`,
          `Hi ${name}, last message from me. Wishing you and ${cx} a great quarter ahead.`,
        ];
  const candidate = variants[Math.abs((lead.id ?? 1) + followUpNumber) % variants.length];
  if (base.message !== introMessage && !(await messageExists(base.message, Number(lead.id)))) {
    return { ...base };
  }
  return { summary: base.summary, message: candidate, framework: "followup", ai: false };
}

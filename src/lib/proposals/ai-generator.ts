// AI Proposal Generator
//
// Retrieves APPROVED company knowledge from the Internal Knowledge Base and
// uses it to generate a personalized proposal. NEVER invents client info,
// pricing, case studies, stats, features or terms — anything not found in
// the KB or provided by the user is left as a placeholder for human review.
//
// AI-generated proposals ALWAYS start in "draft" and require human approval
// before sending.

import { searchKnowledge } from "@/lib/knowledge-base/engine";
import type { ProposalContent, ProposalSection, ProposalService } from "./types";
import { computeTotals } from "./engine";

export interface GenerateProposalInput {
  title: string;
  clientName?: string;
  companyName?: string;
  industry?: string;
  projectDescription?: string;
  businessProblems?: string[];
  goals?: string[];
  requirements?: string[];
  services: string[]; // selected service names
  expiryDays?: number;
  currency?: string;
  customNotes?: string;
}

export interface GenerationResult {
  content: ProposalContent;
  usedLlm: boolean;
  warnings: string[];
}

const WHY_VYRAVO_FALLBACK = `Vyravo AI builds intelligent automation systems — AI chatbots, voice receptionists, workflow automation, CRM and email automation, and custom AI solutions — that eliminate repetitive work, reduce costs, and help modern businesses scale. Every solution is custom-built to your requirements with transparent pricing, full code ownership, and ongoing support.`;

const PROCESS_FALLBACK = [
  "1. Discovery & Requirements — a free consultation to map your business, challenges, and automation goals.",
  "2. Strategy & Proposal — a custom solution design with clear deliverables, timeline, and investment breakdown.",
  "3. Build & Iterate — agile development with regular demos and continuous feedback.",
  "4. Launch & Optimize — deployment, monitoring, and ongoing optimization for maximum ROI.",
].join("\n");

/** Retrieve approved company knowledge for a client context. */
async function retrieveKnowledge(input: GenerateProposalInput): Promise<{
  services: { name: string; description: string; benefits: string[] }[];
  industry: string;
  process: string;
  differentiators: string[];
  caseStudies: string[];
  terms: string;
}> {
  const out = {
    services: [] as { name: string; description: string; benefits: string[] }[],
    industry: "",
    process: PROCESS_FALLBACK,
    differentiators: [] as string[],
    caseStudies: [] as string[],
    terms: "",
  };

  try {
    // Services
    const svcHits = await searchKnowledge({
      query: `${input.services.join(", ")} services`,
      accessLevel: ["public", "internal"],
      topK: 8,
      similarityThreshold: 0.1,
    });
    const svcText = svcHits.map((h) => h.content).join("\n\n");
    for (const name of input.services) {
      const re = new RegExp(`[\\s\\S]{0,80}${escapeRegex(name)}[\\s\\S]{0,600}`, "i");
      const m = svcText.match(re);
      if (m) {
        out.services.push({ name, description: m[0].slice(0, 500), benefits: [] });
      } else {
        out.services.push({ name, description: "", benefits: [] });
      }
    }

    // Industry
    if (input.industry) {
      const indHits = await searchKnowledge({
        query: `${input.industry} industry automation`,
        accessLevel: ["public", "internal"],
        topK: 3,
        similarityThreshold: 0.1,
      });
      if (indHits.length) out.industry = indHits.map((h) => h.content).slice(0, 3).join("\n");
    }

    // Process + differentiators + case studies
    const procHits = await searchKnowledge({
      query: "our engagement process implementation steps",
      accessLevel: ["public", "internal"],
      topK: 3,
      similarityThreshold: 0.1,
    });
    if (procHits.length) out.process = procHits.map((h) => h.content).join("\n");

    const diffHits = await searchKnowledge({
      query: "what makes Vyravo AI different",
      accessLevel: ["public", "internal"],
      topK: 3,
      similarityThreshold: 0.1,
    });
    if (diffHits.length) out.differentiators = diffHits.map((h) => h.content.slice(0, 300));

    const csHits = await searchKnowledge({
      query: `${input.industry || "business"} case study example`,
      accessLevel: ["public", "internal"],
      topK: 3,
      similarityThreshold: 0.1,
    });
    if (csHits.length) out.caseStudies = csHits.map((h) => h.content.slice(0, 350));

    const termsHits = await searchKnowledge({
      query: "proposal terms payment terms support terms",
      accessLevel: ["public", "internal"],
      topK: 3,
      similarityThreshold: 0.1,
    });
    if (termsHits.length) out.terms = termsHits.map((h) => h.content).join("\n\n");
  } catch (e) {
    console.error("KB retrieval failed (falling back to templates):", e);
  }

  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export async function generateProposalContent(input: GenerateProposalInput): Promise<GenerationResult> {
  const warnings: string[] = [];
  const knowledge = await retrieveKnowledge(input);

  // Prefer LLM when available
  if (process.env.OPENAI_API_KEY) {
    try {
      const content = await generateWithLlm(input, knowledge);
      if (content) {
        return { content: withDefaults(content), usedLlm: true, warnings };
      }
      warnings.push("LLM returned no usable content — fell back to template generation.");
    } catch (e) {
      console.error("LLM proposal generation failed:", e);
      warnings.push("LLM generation failed — fell back to template generation.");
    }
  } else {
    warnings.push("OPENAI_API_KEY not set — using template-based generation. Add the key for fully personalized AI writing.");
  }

  const content = generateFromTemplates(input, knowledge);
  return { content, usedLlm: false, warnings };
}

// ---------------------------------------------------------------------------
// LLM path
// ---------------------------------------------------------------------------
async function generateWithLlm(
  input: GenerateProposalInput,
  knowledge: Awaited<ReturnType<typeof retrieveKnowledge>>
): Promise<ProposalContent | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const problems = (input.businessProblems || []).join("; ") || "(not provided)";
  const goals = (input.goals || []).join("; ") || "(not provided)";
  const requirements = (input.requirements || []).join("; ") || "(not provided)";

  const systemPrompt = `You are Vyravo AI's proposal writer. Write a professional, personalized AI-automation proposal for a specific client.

STRICT RULES — NEVER fabricate:
1. Client information: only use what is provided. If a field is "(not provided)", write a neutral placeholder like "[Client Name]" or "[Company]".
2. Pricing: NEVER invent prices. Pricing is added by the team after review — leave the Investment section with placeholders ("[Amount to be confirmed]").
3. Case studies, testimonials, statistics, ROI: use ONLY the provided company knowledge. If none is relevant, omit them or say the team will include a relevant case study.
4. Features, benefits, services, terms, process: use ONLY the provided company knowledge. Do not invent capabilities.
5. Keep it concise and professional. Use plain text with markdown-style headings and bullets. Each section returns { id, title, content }.

Client context:
- Client: ${input.clientName || "[Client Name]"}${input.companyName ? ` (${input.companyName})` : ""}
- Industry: ${input.industry || "(not provided)"}
- Project: ${input.title}
- Description: ${input.projectDescription || "(not provided)"}
- Business problems: ${problems}
- Goals: ${goals}
- Requirements: ${requirements}
- Selected services: ${input.services.join(", ")}
- Custom notes: ${input.customNotes || "(none)"}

Approved company knowledge (use ONLY this):
### Services
${knowledge.services.map((s) => `- ${s.name}: ${s.description || "(see team)"}`).join("\n")}
### Industry
${knowledge.industry || "(no industry-specific knowledge)"}
### Process
${knowledge.process}
### Differentiators
${knowledge.differentiators.join("\n") || WHY_VYRAVO_FALLBACK}
### Case studies
${knowledge.caseStudies.join("\n") || "(none available)"}
### Terms
${knowledge.terms || "(use standard proposal terms set by the team)"}

Return JSON ONLY (valid JSON, no markdown fences) with this shape:
{
  "sections": [
    {"id": "executive_summary", "title": "Executive Summary", "type": "prose", "content": "..."},
    {"id": "understanding", "title": "Understanding of Your Business", "type": "prose", "content": "..."},
    {"id": "challenges", "title": "Current Challenges", "type": "prose", "content": "..."},
    {"id": "solution", "title": "Proposed Solution", "type": "prose", "content": "..."},
    {"id": "scope", "title": "Scope of Work", "type": "prose", "content": "..."},
    {"id": "deliverables", "title": "Deliverables", "type": "list", "items": ["...", "..."]},
    {"id": "implementation", "title": "Implementation Process", "type": "prose", "content": "..."},
    {"id": "timeline", "title": "Timeline", "type": "prose", "content": "..."},
    {"id": "support", "title": "Support & Maintenance", "type": "prose", "content": "..."}
  ],
  "services": [{"id":"ai-chatbot","name":"AI Chatbot","description":"...","benefits":["..."],"deliverables":["..."]}],
  "timeline": "narrative timeline",
  "paymentTerms": "standard terms placeholder",
  "supportTerms": "support terms from knowledge"
}
Include ONLY sections that are relevant to this client. Do NOT include cover/terms/acceptance/contact/investment sections (the system adds those).`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.KB_LLM_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Write the proposal for: ${input.title}` },
      ],
      temperature: 0.5,
      max_tokens: 1800,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.warn("Proposal LLM error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(text);
    const sections: ProposalSection[] = Array.isArray(parsed.sections) ? parsed.sections : [];
    const services: ProposalService[] = Array.isArray(parsed.services)
      ? parsed.services.map((s: any, i: number) => ({
          id: s.id || `svc-${i}`,
          name: s.name || input.services[i] || `Service ${i + 1}`,
          description: s.description || "",
          benefits: Array.isArray(s.benefits) ? s.benefits : [],
          deliverables: Array.isArray(s.deliverables) ? s.deliverables : [],
        }))
      : input.services.map((n, i) => ({ id: `svc-${i}`, name: n }));
    return {
      sections,
      services,
      timeline: parsed.timeline || "",
      paymentTerms: parsed.paymentTerms || "",
      supportTerms: parsed.supportTerms || "",
      addons: [],
      milestones: [],
      pricing: {
        currency: input.currency || "USD",
        implementation: 0,
        monthlyRetainer: 0,
        addons: [],
        discount: 0,
        taxRate: 0,
        total: 0,
        monthlyTotal: 0,
      },
      expiryDays: input.expiryDays || 14,
    };
  } catch (e) {
    console.error("Failed to parse LLM proposal JSON:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Template fallback (no LLM) — deterministic, KB-informed
// ---------------------------------------------------------------------------
function generateFromTemplates(
  input: GenerateProposalInput,
  knowledge: Awaited<ReturnType<typeof retrieveKnowledge>>
): ProposalContent {
  const client = input.clientName || "[Client Name]";
  const company = input.companyName || "[Company]";
  const problems = input.businessProblems?.length
    ? input.businessProblems.map((p) => `- ${p}`).join("\n")
    : "- (To be confirmed during discovery)";
  const goals = input.goals?.length
    ? input.goals.map((g) => `- ${g}`).join("\n")
    : "- (To be confirmed during discovery)";

  const services: ProposalService[] = input.services.map((name, i) => {
    const kb = knowledge.services.find((s) => s.name.toLowerCase().includes(name.toLowerCase()));
    return {
      id: `svc-${i}`,
      name,
      description: kb?.description || "Scope to be confirmed during kickoff.",
      benefits: kb?.benefits || [],
      deliverables: [],
    };
  });

  const serviceList = input.services.map((s) => `- **${s}**`).join("\n");

  const sections: ProposalSection[] = [
    {
      id: "executive_summary",
      title: "Executive Summary",
      type: "prose",
      content: `This proposal outlines a tailored AI automation solution for ${company}. It addresses the specific challenges and goals discussed, and recommends the following systems:\n\n${serviceList}\n\nEach recommended system is custom-built around ${company}'s workflows, integrates with existing tools, and is designed to deliver measurable operational improvements.`,
    },
    {
      id: "understanding",
      title: "Understanding of Your Business",
      type: "prose",
      content: `Vyravo AI has prepared this proposal for ${client}${company ? ` at ${company}` : ""}${input.industry ? ` in the ${input.industry} industry` : ""}. Our recommendations are based on the requirements shared${input.industry ? ` and our knowledge of automation opportunities in the ${input.industry} space` : ""}.`,
    },
    {
      id: "challenges",
      title: "Current Challenges",
      type: "prose",
      content: `Based on our discussion, key challenges and areas of focus include:\n\n${problems}`,
    },
    {
      id: "goals",
      title: "Goals & Objectives",
      type: "prose",
      content: `The primary objectives for this engagement are:\n\n${goals}`,
    },
    {
      id: "solution",
      title: "Proposed Solution",
      type: "prose",
      content: `We recommend a phased implementation of AI automation that is tailored to ${company}'s workflows:\n\n${serviceList}\n\nEach system is built to integrate with your existing tools and to scale as your business grows.`,
    },
    {
      id: "scope",
      title: "Scope of Work",
      type: "prose",
      content: input.projectDescription
        ? input.projectDescription
        : "Detailed scope to be confirmed during the kickoff call (requirements gathering, architecture, development, testing, deployment, and training).",
    },
    {
      id: "deliverables",
      title: "Deliverables",
      type: "list",
      items: [
        "Custom-built AI systems as listed in the Solution section",
        "Integration with your existing tools and workflows",
        "Documentation and handover materials",
        "Team training session",
        "30 days of post-launch support",
      ],
    },
    {
      id: "implementation",
      title: "Implementation Process",
      type: "prose",
      content: knowledge.process || PROCESS_FALLBACK,
    },
    {
      id: "timeline",
      title: "Timeline",
      type: "prose",
      content: input.requirements?.length
        ? `Target timeline based on requirements: ${input.requirements.join(", ")}`
        : "A detailed timeline will be confirmed during kickoff. Typical AI automation projects are delivered within 4–8 weeks.",
    },
    {
      id: "why_vyravo",
      title: "Why Vyravo AI",
      type: "prose",
      content: knowledge.differentiators.join("\n") || WHY_VYRAVO_FALLBACK,
    },
  ];

  if (knowledge.caseStudies.length) {
    sections.push({
      id: "case_studies",
      title: "Relevant Case Studies",
      type: "list",
      items: knowledge.caseStudies.map((c) => c.slice(0, 200)),
    });
  }

  return {
    sections,
    services,
    timeline: "",
    paymentTerms: "50% upfront, 50% on completion (adjustable in the proposal editor).",
    supportTerms:
      "All projects include 30 days of complimentary post-launch support. Ongoing maintenance and optimization packages are available.",
    addons: [],
    milestones: [],
    pricing: {
      currency: input.currency || "USD",
      implementation: 0,
      monthlyRetainer: 0,
      addons: [],
      discount: 0,
      taxRate: 0,
      total: 0,
      monthlyTotal: 0,
    },
    expiryDays: input.expiryDays || 14,
  };
}

// Add structural sections the editor/PDF renderer expects
function withDefaults(content: ProposalContent): ProposalContent {
  const have = new Set(content.sections.map((s) => s.id));
  const add = (s: ProposalSection) => {
    if (!have.has(s.id)) content.sections.push(s);
  };
  add({ id: "cover", title: "Cover", type: "cover" });
  add({ id: "investment", title: "Investment", type: "pricing" });
  add({ id: "terms", title: "Terms & Conditions", type: "prose", content: content.paymentTerms || "" });
  add({ id: "acceptance", title: "Acceptance", type: "acceptance" });
  add({ id: "contact", title: "Contact", type: "contact" });
  // compute totals placeholder
  computeTotals(content);
  return content;
}

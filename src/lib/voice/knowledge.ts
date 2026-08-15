// Voice Receptionist — business knowledge layer.
//
// The receptionist must NEVER invent business-specific information. Everything
// it says comes from this interface. Today it is built from:
//   1. The receptionist configuration (voiceConfig table / defaults)
//   2. The existing chatbot knowledge base (COMPANY_KNOWLEDGE) — the same
//      source the website chatbot already uses.
//
// When the Internal Knowledge Base feature ships, it plugs in HERE by
// extending getBusinessKnowledge() — no other part of the voice feature
// needs to change.

import { COMPANY, SITE_LINKS, SERVICES } from "@/lib/constants";
import { COMPANY_KNOWLEDGE } from "@/lib/chatbot/knowledge";
import type { VoiceConfig } from "./types";

export interface BusinessKnowledge {
  businessName: string;
  description: string;
  industry: string;
  location: string;
  businessHours: string;
  timeZone: string;
  services: { name: string; short: string }[];
  serviceNames: string[];
  pricingPolicy: string;
  booking: {
    link: string;
    duration: string;
    cost: string;
    whatToExpect: string[];
  };
  contact: {
    phone: string;
    email: string;
  };
  answers: {
    businessHours: string;
    location: string;
    services: string;
    pricing: string;
  };
}

/**
 * Resolve business knowledge for the receptionist.
 *
 * @param config The receptionist configuration (may be defaults).
 * @returns Everything the AI receptionist is allowed to say about the business.
 */
export function getBusinessKnowledge(config: VoiceConfig): BusinessKnowledge {
  const services = SERVICES.map((s) => ({
    name: s.title,
    short: s.description.split(".")[0],
  }));

  const description =
    config.businessDescription?.trim() ||
    `${config.businessName} is an AI automation company. We build AI chatbots, voice agents, and intelligent automation systems that help businesses save time, reduce costs, and scale.`;

  const businessHours = config.businessHours || COMPANY.hours;
  const location = config.location || COMPANY.location;

  return {
    businessName: config.businessName,
    description,
    industry: config.industry,
    location,
    businessHours,
    timeZone: config.timeZone,
    services,
    serviceNames: services.map((s) => s.name),
    pricingPolicy:
      "Every solution is custom-priced based on your workflows, integrations, and requirements — no one-size-fits-all packages.",
    booking: {
      link: SITE_LINKS.discoveryCall,
      duration: COMPANY_KNOWLEDGE.discoveryCall.duration,
      cost: COMPANY_KNOWLEDGE.discoveryCall.cost,
      whatToExpect: COMPANY_KNOWLEDGE.discoveryCall.includes,
    },
    contact: {
      phone: COMPANY.phone,
      email: COMPANY.email,
    },
    answers: {
      businessHours: `Our business hours are ${businessHours} (${config.timeZone}).`,
      location: `We are based in ${location} and work with businesses worldwide.`,
      services: `We offer ${services.map((s) => s.name).join(", ")}, and custom AI solutions.`,
      pricing: `Our pricing is customized for each business — ${description ? "" : ""}there are no fixed packages. The best way to get a tailored quote is a free discovery call.`,
    },
  };
}

/** Default configuration used until the business customizes it. */
export function getDefaultConfig(): VoiceConfig {
  return {
    businessId: "vyravo-demo",
    businessName: "Vyravo AI",
    businessDescription:
      "Vyravo AI builds AI chatbots, voice agents, workflow automation, and custom AI solutions that help businesses save time, reduce costs, and scale.",
    industry: "AI Automation",
    location: COMPANY.location,
    businessHours: COMPANY.hours,
    timeZone: "Asia/Kolkata (IST)",
    receptionistName: "Vera",
    voice: "Natural Female",
    language: "English",
    speakingStyle: "Professional & friendly",
    greeting:
      "Hi, thanks for calling {business}. I'm {name}, the AI receptionist. How can I help you today?",
    escalationEnabled: true,
    transferNumber: COMPANY.phone,
    demoMode: true,
  };
}

/** Fill the greeting template with the configured business/receptionist names. */
export function renderGreeting(config: VoiceConfig): string {
  return (config.greeting || getDefaultConfig().greeting)
    .replaceAll("{business}", config.businessName)
    .replaceAll("{name}", config.receptionistName);
}

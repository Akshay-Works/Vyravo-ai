// Lead Scoring & Qualification Engine

import type { LeadFormData, LeadQualification, ServiceRecommendation, MeetingBrief } from "./types";

// Scoring weights
const SCORING_WEIGHTS = {
  companySize: {
    "1-5": 10,
    "6-20": 20,
    "21-50": 30,
    "51-200": 40,
    "201-1000": 50,
    "1000+": 60,
  },
  budget: {
    "under_2500": 10,
    "2500_5000": 20,
    "5000_10000": 35,
    "10000_25000": 50,
    "25000_50000": 70,
    "50000+": 90,
    "not_sure": 15,
  },
  timeline: {
    "asap": 30,
    "1_month": 25,
    "1_3_months": 20,
    "3_6_months": 10,
    "6_months+": 5,
    "exploring": 5,
  },
  monthlyLeads: {
    "under_50": 5,
    "50_200": 10,
    "200_500": 15,
    "500_1000": 20,
    "1000_5000": 25,
    "5000+": 30,
    "not_applicable": 10,
  },
};

// Industry-specific service recommendations
const INDUSTRY_SERVICES: Record<string, ServiceRecommendation[]> = {
  healthcare: [
    { service: "AI Voice Agents", reason: "Handle appointment scheduling and patient inquiries 24/7, reducing administrative workload by up to 60%", priority: "high" },
    { service: "AI Chatbots", reason: "Provide instant patient support, answer FAQs, and triage inquiries before human intervention", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate appointment reminders, follow-ups, and administrative tasks to save 200+ hours monthly", priority: "medium" },
  ],
  restaurants: [
    { service: "AI Chatbots", reason: "Enable 24/7 ordering via WhatsApp/website, increasing order volume by 30-50%", priority: "high" },
    { service: "AI Voice Agents", reason: "Handle reservation calls and takeout orders without staff involvement", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate order confirmations, delivery updates, and review requests", priority: "medium" },
  ],
  real_estate: [
    { service: "AI Chatbots", reason: "Qualify property inquiries 24/7, capturing leads that would otherwise be lost after hours", priority: "high" },
    { service: "AI Sales Automation", reason: "Automate follow-up sequences that keep prospects engaged throughout their buying journey", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate property matching, document processing, and CRM updates", priority: "medium" },
  ],
  hotels: [
    { service: "AI Chatbots", reason: "Provide multilingual concierge service 24/7, improving guest satisfaction by 40%", priority: "high" },
    { service: "AI Voice Agents", reason: "Handle booking inquiries and room service requests without front desk involvement", priority: "high" },
    { service: "Custom AI Solutions", reason: "Build personalized recommendation engines for upselling amenities and services", priority: "medium" },
  ],
  finance: [
    { service: "AI Chatbots", reason: "Streamline customer onboarding and KYC processes, reducing completion time by 80%", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate compliance checks, document processing, and reporting", priority: "high" },
    { service: "Custom AI Solutions", reason: "Build fraud detection and risk assessment systems tailored to your needs", priority: "medium" },
  ],
  manufacturing: [
    { service: "AI Workflow Automation", reason: "Automate quality control, inventory management, and vendor communication", priority: "high" },
    { service: "Custom AI Solutions", reason: "Implement predictive maintenance and supply chain optimization", priority: "high" },
    { service: "AI Chatbots", reason: "Create internal knowledge bases for employee self-service", priority: "medium" },
  ],
  education: [
    { service: "AI Chatbots", reason: "Handle enrollment inquiries and student support 24/7, improving response rates by 3x", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate enrollment processing, grading assistance, and administrative tasks", priority: "high" },
    { service: "Custom AI Solutions", reason: "Build personalized learning assistants and tutoring systems", priority: "medium" },
  ],
  agency: [
    { service: "AI Workflow Automation", reason: "Automate client reporting, content scheduling, and campaign management", priority: "high" },
    { service: "AI Sales Automation", reason: "Streamline proposal generation and lead nurturing sequences", priority: "high" },
    { service: "AI Chatbots", reason: "Qualify leads on your website 24/7 and for your clients' websites", priority: "medium" },
  ],
  professional_services: [
    { service: "AI Chatbots", reason: "Automate client intake and qualification, capturing leads after hours", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate document generation, scheduling, and billing processes", priority: "high" },
    { service: "AI Voice Agents", reason: "Handle appointment scheduling and common client inquiries", priority: "medium" },
  ],
  ecommerce: [
    { service: "AI Chatbots", reason: "Provide 24/7 customer support and product recommendations, increasing conversions by 25-35%", priority: "high" },
    { service: "AI Sales Automation", reason: "Automate cart abandonment recovery and personalized follow-ups", priority: "high" },
    { service: "Custom AI Solutions", reason: "Build product recommendation engines and inventory optimization", priority: "medium" },
  ],
  technology: [
    { service: "AI Chatbots", reason: "Provide technical support and product guidance 24/7", priority: "high" },
    { service: "AI Sales Automation", reason: "Automate lead qualification and demo scheduling", priority: "high" },
    { service: "Custom AI Solutions", reason: "Build custom AI features to integrate into your product", priority: "medium" },
  ],
  legal: [
    { service: "AI Chatbots", reason: "Qualify potential clients and answer common legal FAQs 24/7", priority: "high" },
    { service: "AI Workflow Automation", reason: "Automate document generation, case management, and billing", priority: "high" },
    { service: "AI Voice Agents", reason: "Handle initial client inquiries and appointment scheduling", priority: "medium" },
  ],
  other: [
    { service: "AI Chatbots", reason: "Automate customer support and lead qualification 24/7", priority: "high" },
    { service: "AI Workflow Automation", reason: "Eliminate repetitive manual tasks and streamline operations", priority: "high" },
    { service: "AI Consulting", reason: "Get expert guidance on the best AI solutions for your specific needs", priority: "medium" },
  ],
};

export function qualifyLead(data: LeadFormData): LeadQualification {
  let score = 0;
  
  // Company size scoring
  const sizeScore = SCORING_WEIGHTS.companySize[data.companySize as keyof typeof SCORING_WEIGHTS.companySize] || 10;
  score += sizeScore;
  
  // Budget scoring
  const budgetScore = SCORING_WEIGHTS.budget[data.budgetRange as keyof typeof SCORING_WEIGHTS.budget] || 10;
  score += budgetScore;
  
  // Timeline scoring
  const timelineScore = SCORING_WEIGHTS.timeline[data.timeline as keyof typeof SCORING_WEIGHTS.timeline] || 5;
  score += timelineScore;
  
  // Monthly leads scoring
  if (data.monthlyLeads) {
    const leadsScore = SCORING_WEIGHTS.monthlyLeads[data.monthlyLeads as keyof typeof SCORING_WEIGHTS.monthlyLeads] || 5;
    score += leadsScore;
  }
  
  // Bonus points
  if (data.businessWebsite) score += 5;
  if (data.phone) score += 5;
  if (data.biggestChallenge && data.biggestChallenge.length > 50) score += 10;
  if (data.automationGoals && data.automationGoals.length > 50) score += 10;
  
  // Normalize score to 0-100
  score = Math.min(100, Math.round(score * 0.5));
  
  // Determine category
  let category: "hot" | "warm" | "cold";
  if (score >= 70) {
    category = "hot";
  } else if (score >= 40) {
    category = "warm";
  } else {
    category = "cold";
  }
  
  // Determine type
  let type: "enterprise" | "startup" | "small_business" | "agency";
  const size = data.companySize;
  if (size === "201-1000" || size === "1000+") {
    type = "enterprise";
  } else if (size === "1-5" && (data.timeline === "asap" || data.timeline === "1_month")) {
    type = "startup";
  } else if (data.industry === "agency") {
    type = "agency";
  } else {
    type = "small_business";
  }
  
  // Get recommended services
  const recommendedServices = INDUSTRY_SERVICES[data.industry] || INDUSTRY_SERVICES.other;
  
  // Generate summary
  const summary = generateQualificationSummary(data, score, category, type);
  
  return {
    score,
    category,
    type,
    recommendedServices,
    summary,
  };
}

function generateQualificationSummary(
  data: LeadFormData,
  score: number,
  category: string,
  type: string
): string {
  const parts = [];
  
  // Lead quality
  if (category === "hot") {
    parts.push(`High-quality ${type} lead with strong buying signals.`);
  } else if (category === "warm") {
    parts.push(`Promising ${type} lead with moderate engagement potential.`);
  } else {
    parts.push(`Early-stage ${type} lead, may need nurturing.`);
  }
  
  // Industry context
  const industryLabel = data.industry.replace(/_/g, " ");
  parts.push(`Operating in the ${industryLabel} industry.`);
  
  // Timeline
  if (data.timeline === "asap" || data.timeline === "1_month") {
    parts.push("Ready to move quickly.");
  } else if (data.timeline === "exploring") {
    parts.push("Currently in exploration phase.");
  }
  
  // Budget
  if (data.budgetRange.includes("50000") || data.budgetRange.includes("25000")) {
    parts.push("Has significant budget available.");
  } else if (data.budgetRange === "not_sure") {
    parts.push("Budget to be determined during call.");
  }
  
  return parts.join(" ");
}

export function generateMeetingBrief(data: LeadFormData, qualification: LeadQualification): MeetingBrief {
  const industryLabel = data.industry.replace(/_/g, " ");
  
  // Client summary
  const clientSummary = `${data.fullName} from ${data.businessName || "their company"} is a ${qualification.type.replace(/_/g, " ")} in the ${industryLabel} industry. Company size: ${data.companySize} employees. Lead score: ${qualification.score}/100 (${qualification.category}).`;
  
  // Business challenges
  const businessChallenges = [
    data.biggestChallenge,
    ...(data.automationGoals ? [`Automation goals: ${data.automationGoals}`] : []),
    ...(data.desiredOutcome ? [`Desired outcome: ${data.desiredOutcome}`] : []),
  ].filter(Boolean);
  
  // Automation opportunities based on industry
  const automationOpportunities = qualification.recommendedServices.map(
    s => `${s.service}: ${s.reason}`
  );
  
  // Suggested questions
  const suggestedQuestions = [
    "What does your current workflow look like for handling [main challenge]?",
    "How many hours per week does your team spend on repetitive tasks?",
    "What tools or software are you currently using?",
    "What would success look like for you after implementing AI automation?",
    "Have you tried any automation solutions before? What worked/didn't work?",
    "Who else would be involved in the decision-making process?",
    `What's your timeline for implementing a solution?`,
    "What's your budget range for this project?",
  ];
  
  // Recommended solutions
  const recommendedSolutions = qualification.recommendedServices
    .filter(s => s.priority === "high")
    .map(s => s.service);
  
  // Upsell opportunities
  const upsellOpportunities = qualification.recommendedServices
    .filter(s => s.priority === "medium")
    .map(s => `${s.service} - ${s.reason}`);
  
  // Meeting objectives
  const meetingObjectives = [
    "Understand their specific pain points in detail",
    "Validate the recommended solution approach",
    "Establish timeline and budget expectations",
    "Identify decision-makers and buying process",
    "Agree on next steps (proposal, demo, or pilot)",
  ];
  
  return {
    clientSummary,
    businessChallenges,
    automationOpportunities,
    suggestedQuestions,
    recommendedSolutions,
    upsellOpportunities,
    meetingObjectives,
  };
}

// Calculate priority for follow-up
export function getFollowUpPriority(qualification: LeadQualification): "urgent" | "high" | "medium" | "low" {
  if (qualification.category === "hot" && qualification.score >= 80) return "urgent";
  if (qualification.category === "hot") return "high";
  if (qualification.category === "warm") return "medium";
  return "low";
}

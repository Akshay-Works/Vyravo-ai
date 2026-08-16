// Proposal Automation — shared types

export type ProposalStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "changes_requested"
  | "expired"
  | "archived";

export type ProposalEventType =
  | "created"
  | "generated"
  | "ai_generated"
  | "edited"
  | "approved"
  | "sent"
  | "delivered"
  | "opened"
  | "viewed"
  | "section_viewed"
  | "downloaded"
  | "follow_up"
  | "accepted"
  | "rejected"
  | "changes_requested"
  | "expired"
  | "archived"
  | "restored"
  | "duplicated";

export interface ProposalSection {
  id: string;
  title: string;
  type: "cover" | "prose" | "list" | "pricing" | "acceptance" | "contact" | "divider";
  content?: string;
  items?: string[];
}

export interface ProposalService {
  id: string;
  name: string;
  description?: string;
  benefits?: string[];
  deliverables?: string[];
  implementationFee?: number;
  monthlyRecurring?: number;
  quantity?: number;
  isAddon?: boolean;
}

export interface ProposalPricing {
  currency: string;
  implementation: number;
  monthlyRetainer: number;
  addons: { name: string; price: number }[];
  discount: number;
  taxRate: number;
  total: number;
  monthlyTotal: number;
}

export interface ProposalMilestone {
  id: string;
  label: string;
  percent: number;
  amount: number;
}

export interface ProposalContent {
  sections: ProposalSection[];
  services: ProposalService[];
  pricing: ProposalPricing;
  milestones: ProposalMilestone[];
  timeline: string;
  paymentTerms: string;
  supportTerms: string;
  expiryDays: number;
  addons: string[];
}

export interface ProposalData {
  id: number;
  title: string;
  number: string | null;
  status: ProposalStatus;
  clientName: string | null;
  companyName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientWebsite: string | null;
  industry: string | null;
  leadId: number | null;
  clientId: number | null;
  summary: string | null;
  projectDescription: string | null;
  businessProblems: string[] | null;
  goals: string[] | null;
  requirements: string[] | null;
  selectedServices: ProposalService[] | null;
  content: ProposalContent | null;
  paymentTerms: string | null;
  supportTerms: string | null;
  expiryDays: number | null;
  generatedByAi: boolean | null;
  aiStatus: string | null;
  currency: string | null;
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  total: string | null;
  secureToken: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  signedBy: string | null;
  signedAt: string | null;
  followUpStage: number | null;
  totalViewed: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalAnalytics {
  total: number;
  byStatus: Record<string, number>;
  totalValue: number;
  conversionRate: number;
  averageValue: number;
  avgDaysToAccept: number;
  viewRate: number;
  acceptedRevenue: number;
  drafts: number;
  sent: number;
  viewed: number;
  accepted: number;
  rejected: number;
  expired: number;
}

export const SERVICE_CATALOG = [
  { name: "AI Chatbot", slug: "ai-chatbot", category: "chatbot" },
  { name: "AI Voice Receptionist", slug: "ai-voice-receptionist", category: "voice" },
  { name: "CRM Automation", slug: "crm-automation", category: "crm" },
  { name: "Email Automation", slug: "email-automation", category: "email" },
  { name: "Discovery Call Automation", slug: "discovery-call-automation", category: "discovery" },
  { name: "Internal Knowledge Base", slug: "internal-knowledge-base", category: "knowledge" },
  { name: "Proposal Automation", slug: "proposal-automation", category: "proposal" },
  { name: "Client Portal", slug: "client-portal", category: "portal" },
  { name: "Analytics Dashboard", slug: "analytics-dashboard", category: "analytics" },
  { name: "Custom Workflow Automation", slug: "custom-workflow-automation", category: "custom" },
];

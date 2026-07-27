// Discovery Call System Types

export interface LeadFormData {
  // Step 1: Basic Info
  fullName: string;
  email: string;
  phone?: string;
  
  // Step 2: Business Info
  businessName?: string;
  businessWebsite?: string;
  industry: string;
  companySize: string;
  country: string;
  
  // Step 3: Challenges
  currentSoftware?: string;
  biggestChallenge: string;
  automationGoals: string;
  
  // Step 4: Goals & Budget
  monthlyLeads?: string;
  desiredOutcome: string;
  budgetRange: string;
  timeline: string;
  additionalInfo?: string;
}

export interface LeadQualification {
  score: number; // 0-100
  category: "hot" | "warm" | "cold";
  type: "enterprise" | "startup" | "small_business" | "agency";
  recommendedServices: ServiceRecommendation[];
  summary: string;
}

export interface ServiceRecommendation {
  service: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface MeetingBrief {
  clientSummary: string;
  businessChallenges: string[];
  automationOpportunities: string[];
  suggestedQuestions: string[];
  recommendedSolutions: string[];
  upsellOpportunities: string[];
  meetingObjectives: string[];
}

export interface BookingConfirmation {
  leadId: number;
  meetingDate: Date;
  meetingTimezone: string;
  meetingLink: string;
  calendarEventId?: string;
}

export interface EmailTemplate {
  subject: string;
  body: string;
  ctaText?: string;
  ctaLink?: string;
}

export type EmailType = 
  | "confirmation"
  | "reminder_24h"
  | "reminder_2h"
  | "reminder_30m"
  | "thank_you"
  | "proposal"
  | "follow_up_2d"
  | "follow_up_5d"
  | "follow_up_10d";

export interface WebhookPayload {
  event: string;
  leadId: number;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface AnalyticsEvent {
  type: 
    | "form_started"
    | "form_step_completed"
    | "form_submitted"
    | "meeting_booked"
    | "meeting_completed"
    | "meeting_cancelled"
    | "meeting_no_show"
    | "email_sent"
    | "email_opened"
    | "proposal_viewed";
  leadId?: number;
  metadata?: Record<string, unknown>;
}

// Industry options
export const INDUSTRIES = [
  { value: "healthcare", label: "Healthcare" },
  { value: "restaurants", label: "Restaurants & Food Service" },
  { value: "real_estate", label: "Real Estate" },
  { value: "hotels", label: "Hotels & Hospitality" },
  { value: "finance", label: "Finance & Banking" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "education", label: "Education" },
  { value: "agency", label: "Marketing Agency" },
  { value: "professional_services", label: "Professional Services" },
  { value: "ecommerce", label: "E-commerce & Retail" },
  { value: "technology", label: "Technology & SaaS" },
  { value: "legal", label: "Legal Services" },
  { value: "other", label: "Other" },
];

export const COMPANY_SIZES = [
  { value: "1-5", label: "1-5 employees" },
  { value: "6-20", label: "6-20 employees" },
  { value: "21-50", label: "21-50 employees" },
  { value: "51-200", label: "51-200 employees" },
  { value: "201-1000", label: "201-1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
];

export const BUDGET_RANGES = [
  { value: "under_2500", label: "Under $2,500" },
  { value: "2500_5000", label: "$2,500 - $5,000" },
  { value: "5000_10000", label: "$5,000 - $10,000" },
  { value: "10000_25000", label: "$10,000 - $25,000" },
  { value: "25000_50000", label: "$25,000 - $50,000" },
  { value: "50000+", label: "$50,000+" },
  { value: "not_sure", label: "Not sure yet" },
];

export const TIMELINES = [
  { value: "asap", label: "As soon as possible" },
  { value: "1_month", label: "Within 1 month" },
  { value: "1_3_months", label: "1-3 months" },
  { value: "3_6_months", label: "3-6 months" },
  { value: "6_months+", label: "6+ months" },
  { value: "exploring", label: "Just exploring" },
];

export const MONTHLY_LEADS = [
  { value: "under_50", label: "Under 50" },
  { value: "50_200", label: "50-200" },
  { value: "200_500", label: "200-500" },
  { value: "500_1000", label: "500-1,000" },
  { value: "1000_5000", label: "1,000-5,000" },
  { value: "5000+", label: "5,000+" },
  { value: "not_applicable", label: "Not applicable" },
];

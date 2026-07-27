// CRM Type Definitions

export interface Lead {
  id: number;
  fullName: string;
  email: string;
  phone?: string | null;
  businessName?: string | null;
  businessWebsite?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  currentSoftware?: string | null;
  biggestChallenge?: string | null;
  automationGoals?: string | null;
  budgetRange?: string | null;
  timeline?: string | null;
  leadScore: number;
  leadCategory?: string | null;
  leadType?: string | null;
  recommendedServices?: string[] | null;
  qualificationSummary?: string | null;
  stage: string;
  status: string;
  priority: string;
  ownerId?: number | null;
  tags?: string[] | null;
  meetingStatus?: string | null;
  meetingDate?: Date | null;
  nextFollowUp?: Date | null;
  lastContactedAt?: Date | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Client {
  id: number;
  companyName: string;
  industry?: string | null;
  website?: string | null;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
  primaryContactRole?: string | null;
  country?: string | null;
  status: string;
  lifetimeValue: string;
  monthlyRecurring: string;
  tags?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: number;
  name: string;
  description?: string | null;
  clientId: number;
  type?: string | null;
  status: string;
  priority: string;
  startDate?: string | null;
  dueDate?: string | null;
  progress: number;
  value?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  projectId?: number | null;
  leadId?: number | null;
  clientId?: number | null;
  assigneeId?: number | null;
  status: string;
  priority: string;
  dueDate?: Date | null;
  completedAt?: Date | null;
  tags?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Meeting {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  leadId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  scheduledAt: Date;
  duration: number;
  timezone?: string | null;
  meetingLink?: string | null;
  status: string;
  agenda?: string | null;
  notes?: string | null;
  summary?: string | null;
  actionItems?: string[] | null;
  createdAt: Date;
}

export interface Proposal {
  id: number;
  title: string;
  number?: string | null;
  leadId?: number | null;
  clientId?: number | null;
  summary?: string | null;
  total?: string | null;
  status: string;
  sentAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface Invoice {
  id: number;
  number: string;
  clientId: number;
  projectId?: number | null;
  total: string;
  amountPaid: string;
  amountDue: string;
  status: string;
  issueDate: string;
  dueDate: string;
  paidAt?: Date | null;
  createdAt: Date;
}

export interface Activity {
  id: number;
  type: string;
  action: string;
  description?: string | null;
  leadId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface DashboardStats {
  totalLeads: number;
  newLeadsToday: number;
  qualifiedLeads: number;
  hotLeads: number;
  scheduledMeetings: number;
  meetingsToday: number;
  activeProjects: number;
  pendingProposals: number;
  pipelineValue: number;
  revenue: number;
  conversionRate: number;
  avgDealSize: number;
}

export interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  color: string;
  order: number;
  leads: Lead[];
  count: number;
  value: number;
}

// Pipeline stage definitions
export const PIPELINE_STAGES = [
  { slug: "new", name: "New Lead", color: "#6B7280", order: 1 },
  { slug: "qualified", name: "Qualified", color: "#3B82F6", order: 2 },
  { slug: "discovery_scheduled", name: "Discovery Scheduled", color: "#8B5CF6", order: 3 },
  { slug: "discovery_completed", name: "Discovery Completed", color: "#06B6D4", order: 4 },
  { slug: "proposal_sent", name: "Proposal Sent", color: "#F59E0B", order: 5 },
  { slug: "negotiation", name: "Negotiation", color: "#EF4444", order: 6 },
  { slug: "won", name: "Won", color: "#10B981", order: 7 },
  { slug: "lost", name: "Lost", color: "#6B7280", order: 8 },
];

export const LEAD_SOURCES = [
  "Website",
  "Referral",
  "LinkedIn",
  "Google Ads",
  "Facebook",
  "Cold Outreach",
  "Event",
  "Partner",
  "Other",
];

export const TASK_STATUSES = [
  { value: "todo", label: "To Do", color: "#6B7280" },
  { value: "in_progress", label: "In Progress", color: "#3B82F6" },
  { value: "review", label: "In Review", color: "#F59E0B" },
  { value: "completed", label: "Completed", color: "#10B981" },
];

export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning", color: "#6B7280" },
  { value: "in_progress", label: "In Progress", color: "#3B82F6" },
  { value: "on_hold", label: "On Hold", color: "#F59E0B" },
  { value: "completed", label: "Completed", color: "#10B981" },
  { value: "cancelled", label: "Cancelled", color: "#EF4444" },
];

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", color: "#6B7280" },
  { value: "sent", label: "Sent", color: "#3B82F6" },
  { value: "viewed", label: "Viewed", color: "#8B5CF6" },
  { value: "paid", label: "Paid", color: "#10B981" },
  { value: "overdue", label: "Overdue", color: "#EF4444" },
  { value: "cancelled", label: "Cancelled", color: "#6B7280" },
];

import { pgTable, serial, text, timestamp, boolean, integer, jsonb, varchar, decimal, date } from "drizzle-orm/pg-core";

// ==================== LEADS ====================
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  
  // Business Info
  businessName: text("business_name"),
  businessWebsite: text("business_website"),
  industry: text("industry"),
  companySize: text("company_size"),
  country: text("country"),
  
  // Qualification
  currentSoftware: text("current_software"),
  biggestChallenge: text("biggest_challenge"),
  automationGoals: text("automation_goals"),
  monthlyLeads: text("monthly_leads"),
  desiredOutcome: text("desired_outcome"),
  budgetRange: text("budget_range"),
  timeline: text("timeline"),
  additionalInfo: text("additional_info"),
  
  // AI Analysis
  leadScore: integer("lead_score").default(0),
  leadCategory: varchar("lead_category", { length: 50 }),
  leadType: varchar("lead_type", { length: 50 }),
  recommendedServices: jsonb("recommended_services").$type<string[]>(),
  qualificationSummary: text("qualification_summary"),
  
  // Pipeline
  stage: varchar("stage", { length: 50 }).default("new"),
  status: varchar("status", { length: 50 }).default("active"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  
  // Assignment
  ownerId: integer("owner_id"),
  tags: jsonb("tags").$type<string[]>(),
  
  // Meeting
  meetingStatus: varchar("meeting_status", { length: 50 }).default("pending"),
  meetingDate: timestamp("meeting_date"),
  meetingTimezone: text("meeting_timezone"),
  meetingLink: text("meeting_link"),
  meetingBrief: jsonb("meeting_brief"),
  
  // Follow-up
  nextFollowUp: timestamp("next_follow_up"),
  lastContactedAt: timestamp("last_contacted_at"),
  
  // Conversion
  convertedToClientId: integer("converted_to_client_id"),
  convertedAt: timestamp("converted_at"),
  lostReason: text("lost_reason"),
  
  // Source
  source: text("source").default("website"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  referrer: text("referrer"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== CLIENTS ====================
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  
  // Company Info
  companyName: text("company_name").notNull(),
  industry: text("industry"),
  website: text("website"),
  logo: text("logo"),
  
  // Primary Contact
  primaryContactName: text("primary_contact_name").notNull(),
  primaryContactEmail: text("primary_contact_email").notNull(),
  primaryContactPhone: text("primary_contact_phone"),
  primaryContactRole: text("primary_contact_role"),
  
  // Address
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  postalCode: text("postal_code"),
  
  // Billing
  billingEmail: text("billing_email"),
  taxId: text("tax_id"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Relationship
  status: varchar("status", { length: 50 }).default("active"),
  accountManager: integer("account_manager"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  
  // Value
  lifetimeValue: decimal("lifetime_value", { precision: 12, scale: 2 }).default("0"),
  monthlyRecurring: decimal("monthly_recurring", { precision: 10, scale: 2 }).default("0"),
  
  // Notes
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>(),
  
  // Source
  convertedFromLeadId: integer("converted_from_lead_id"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PROJECTS ====================
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  name: text("name").notNull(),
  description: text("description"),
  clientId: integer("client_id").notNull(),
  
  // Type & Status
  type: text("type"),
  status: varchar("status", { length: 50 }).default("planning"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  
  // Timeline
  startDate: date("start_date"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at"),
  
  // Progress
  progress: integer("progress").default(0),
  
  // Value
  value: decimal("value", { precision: 10, scale: 2 }),
  
  // Team
  managerId: integer("manager_id"),
  teamMembers: jsonb("team_members").$type<number[]>(),
  
  // Settings
  milestones: jsonb("milestones"),
  tags: jsonb("tags").$type<string[]>(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== TASKS ====================
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  title: text("title").notNull(),
  description: text("description"),
  
  // Relations
  projectId: integer("project_id"),
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  
  // Assignment
  assigneeId: integer("assignee_id"),
  createdById: integer("created_by_id"),
  
  // Status
  status: varchar("status", { length: 50 }).default("todo"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  
  // Timeline
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  
  // Recurrence
  isRecurring: boolean("is_recurring").default(false),
  recurrencePattern: text("recurrence_pattern"),
  
  // Organization
  tags: jsonb("tags").$type<string[]>(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== MEETINGS ====================
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  title: text("title").notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).default("discovery"),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  projectId: integer("project_id"),
  
  // Scheduling
  scheduledAt: timestamp("scheduled_at").notNull(),
  duration: integer("duration").default(30),
  timezone: text("timezone"),
  
  // Location
  location: text("location"),
  meetingLink: text("meeting_link"),
  calendarEventId: text("calendar_event_id"),
  
  // Status
  status: varchar("status", { length: 50 }).default("scheduled"),
  
  // Attendees
  organizerId: integer("organizer_id"),
  attendees: jsonb("attendees").$type<{ name: string; email: string }[]>(),
  
  // Notes
  agenda: text("agenda"),
  notes: text("notes"),
  summary: text("summary"),
  actionItems: jsonb("action_items").$type<string[]>(),
  
  // Recording
  recordingUrl: text("recording_url"),
  transcriptUrl: text("transcript_url"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PROPOSALS ====================
export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  title: text("title").notNull(),
  number: varchar("number", { length: 50 }),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  
  // Content
  summary: text("summary"),
  scope: text("scope"),
  deliverables: jsonb("deliverables"),
  timeline: text("timeline"),
  terms: text("terms"),
  
  // Pricing
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  expiresAt: timestamp("expires_at"),
  
  // Signature
  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at"),
  signatureUrl: text("signature_url"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== INVOICES ====================
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  number: varchar("number", { length: 50 }).notNull(),
  
  // Relations
  clientId: integer("client_id").notNull(),
  projectId: integer("project_id"),
  proposalId: integer("proposal_id"),
  
  // Items
  items: jsonb("items").$type<{ description: string; quantity: number; rate: number; amount: number }[]>(),
  
  // Pricing
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  amountDue: decimal("amount_due", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  // Dates
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"),
  
  // Payment
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  
  // Notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== ACTIVITIES ====================
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  
  // Type & Action
  type: varchar("type", { length: 50 }).notNull(),
  action: text("action").notNull(),
  description: text("description"),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  projectId: integer("project_id"),
  taskId: integer("task_id"),
  meetingId: integer("meeting_id"),
  proposalId: integer("proposal_id"),
  invoiceId: integer("invoice_id"),
  
  // Actor
  userId: integer("user_id"),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== COMMUNICATIONS ====================
export const communications = pgTable("communications", {
  id: serial("id").primaryKey(),
  
  // Type
  channel: varchar("channel", { length: 50 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  
  // Content
  subject: text("subject"),
  content: text("content"),
  
  // Email specific
  fromEmail: text("from_email"),
  toEmail: text("to_email"),
  ccEmail: text("cc_email"),
  
  // Status
  status: varchar("status", { length: 50 }).default("sent"),
  readAt: timestamp("read_at"),
  
  // Attachments
  attachments: jsonb("attachments"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== DOCUMENTS ====================
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  
  // Basic Info
  name: text("name").notNull(),
  type: varchar("type", { length: 50 }),
  mimeType: text("mime_type"),
  size: integer("size"),
  url: text("url"),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  projectId: integer("project_id"),
  proposalId: integer("proposal_id"),
  invoiceId: integer("invoice_id"),
  
  // Organization
  folder: text("folder"),
  tags: jsonb("tags").$type<string[]>(),
  
  // Versioning
  version: integer("version").default(1),
  parentId: integer("parent_id"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== NOTES ====================
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  
  // Content
  content: text("content").notNull(),
  
  // Relations
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  projectId: integer("project_id"),
  meetingId: integer("meeting_id"),
  
  // Author
  authorId: integer("author_id"),
  
  // Visibility
  isPrivate: boolean("is_private").default(false),
  isPinned: boolean("is_pinned").default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ==================== PIPELINE STAGES ====================
export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }),
  order: integer("order").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== TAGS ====================
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: varchar("color", { length: 7 }),
  type: varchar("type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== WEBHOOKS & INTEGRATIONS ====================
export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  webhookType: varchar("webhook_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  payload: jsonb("payload"),
  response: jsonb("response"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailQueue = pgTable("email_queue", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  emailType: varchar("email_type", { length: 50 }).notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  status: varchar("status", { length: 20 }).default("pending"),
  templateData: jsonb("template_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  eventData: jsonb("event_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ==================== CONTACT FORM (original) ====================
export const contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  service: text("service"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  read: boolean("read").default(false).notNull(),
});

// ==================== VOICE RECEPTIONIST ====================
// Table names are scoped (receptionist_*) to avoid colliding with other
// voice-related tables that may exist in the shared database.
export const voiceCalls = pgTable("receptionist_calls", {
  id: serial("id").primaryKey(),
  callId: varchar("call_id", { length: 64 }).notNull().unique(),
  businessId: varchar("business_id", { length: 64 }).notNull().default("vyravo-demo"),

  // Caller
  callerName: text("caller_name"),
  callerPhone: text("caller_phone"),
  callerEmail: text("caller_email"),
  callerCompany: text("caller_company"),

  // Conversation outcome
  intent: varchar("intent", { length: 50 }),
  leadStatus: varchar("lead_status", { length: 20 }).notNull().default("new"),
  qualification: jsonb("qualification").$type<Record<string, string | undefined>>(),
  transcript: jsonb("transcript").$type<{ role: string; text: string; at: string }[]>(),
  summary: text("summary"),
  outcome: varchar("outcome", { length: 60 }),
  actions: jsonb("actions").$type<string[]>(),

  // Metrics
  durationSec: integer("duration_sec").notNull().default(0),

  // Follow-up & integrations
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  followUpStatus: varchar("follow_up_status", { length: 20 }).notNull().default("none"),
  crmSyncStatus: varchar("crm_sync_status", { length: 20 }).notNull().default("not_required"),
  emailStatus: varchar("email_status", { length: 20 }).notNull().default("not_required"),

  // Provenance
  source: varchar("source", { length: 10 }).notNull().default("demo"),
  recordingAvailable: boolean("recording_available").notNull().default(false),
  transcriptAvailable: boolean("transcript_available").notNull().default(false),

  // Timestamps
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const voiceConfig = pgTable("receptionist_config", {
  id: serial("id").primaryKey(),
  businessId: varchar("business_id", { length: 64 }).notNull().unique().default("vyravo-demo"),

  // Business information
  businessName: text("business_name").notNull(),
  businessDescription: text("business_description"),
  industry: text("industry"),
  location: text("location"),
  businessHours: text("business_hours"),
  timeZone: text("time_zone"),

  // Receptionist identity
  receptionistName: text("receptionist_name").notNull(),
  voice: text("voice"),
  language: text("language"),
  speakingStyle: text("speaking_style"),
  greeting: text("greeting").notNull(),

  // Escalation
  escalationEnabled: boolean("escalation_enabled").notNull().default(true),
  transferNumber: text("transfer_number"),

  // Mode
  demoMode: boolean("demo_mode").notNull().default(true),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==================== TYPE EXPORTS ====================
export interface MeetingBrief {
  clientSummary: string;
  businessChallenges: string[];
  automationOpportunities: string[];
  suggestedQuestions: string[];
  recommendedSolutions: string[];
  upsellOpportunities: string[];
  meetingObjectives: string[];
}

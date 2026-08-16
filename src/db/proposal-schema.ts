import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  varchar,
  decimal,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// PROPOSAL AUTOMATION — Drizzle definitions
//
// Reuses the existing `proposals` table (additive columns only) and adds new
// related tables for versions, items, templates, events, comments, acceptance,
// and payment milestones.
// ============================================================================

// --------------------------- proposals (EXISTING) ---------------------------
// Imported from schema.ts — columns added via ALTER TABLE in setup:
//   client_name, company_name, client_email, client_phone, client_website,
//   industry, secure_token, project_description, business_problems, goals,
//   requirements, services (jsonb), content (jsonb), payment_terms,
//   support_terms, expiry_days, generated_by_ai, ai_status, last_activity_at,
//   archived_at, follow_up_stage, notes, changes_requested_at, total_viewed
// We reference the base table for type inference; the additive columns are
// accessed via raw SQL or added to the Drizzle definition here.
export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  // ---- existing columns (from schema.ts) ----
  title: text("title").notNull(),
  number: varchar("number", { length: 50 }),
  leadId: integer("lead_id"),
  clientId: integer("client_id"),
  summary: text("summary"),
  scope: text("scope"),
  deliverables: jsonb("deliverables").$type<Record<string, unknown>>(),
  timeline: text("timeline"),
  terms: text("terms"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  status: varchar("status", { length: 50 }).default("draft"),
  sentAt: timestamp("sent_at"),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  expiresAt: timestamp("expires_at"),
  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at"),
  signatureUrl: text("signature_url"),
  // ---- additive columns (added by setup script) ----
  version: integer("version").default(1),
  clientName: text("client_name"),
  companyName: text("company_name"),
  clientEmail: text("client_email"),
  clientPhone: text("client_phone"),
  clientWebsite: text("client_website"),
  industry: text("industry"),
  secureToken: varchar("secure_token", { length: 64 }),
  projectDescription: text("project_description"),
  businessProblems: jsonb("business_problems").$type<string[]>(),
  goals: jsonb("goals").$type<string[]>(),
  requirements: jsonb("requirements").$type<string[]>(),
  selectedServices: jsonb("selected_services").$type<{ name: string; description?: string; price?: number; recurringMonthly?: number }[]>(),
  proposalContent: jsonb("proposal_content").$type<Record<string, unknown>>(),
  paymentTerms: text("payment_terms"),
  supportTerms: text("support_terms"),
  expiryDays: integer("expiry_days").default(14),
  generatedByAi: boolean("generated_by_ai").default(false),
  aiStatus: varchar("ai_status", { length: 30 }), // pending_generation | generating | generated | failed
  lastActivityAt: timestamp("last_activity_at"),
  archivedAt: timestamp("archived_at"),
  followUpStage: integer("follow_up_stage").default(0),
  notes: text("notes"),
  changesRequestedAt: timestamp("changes_requested_at"),
  totalViewed: integer("total_viewed").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ------------------------ proposal_versions (new) ---------------------------
export const proposalVersions = pgTable("proposal_versions", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  version: integer("version").notNull(),
  title: text("title"),
  content: jsonb("content").$type<Record<string, unknown>>(),
  summary: text("summary"),
  total: decimal("total", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }),
  changedBy: integer("changed_by"),
  changeNote: text("change_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// -------------------------- proposal_items (new) ----------------------------
export const proposalItems = pgTable("proposal_items", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  sortOrder: integer("sort_order").default(0),
  name: text("name").notNull(),
  description: text("description"),
  serviceType: varchar("service_type", { length: 50 }),
  implementationFee: decimal("implementation_fee", { precision: 10, scale: 2 }).default("0"),
  monthlyRecurring: decimal("monthly_recurring", { precision: 10, scale: 2 }).default("0"),
  quantity: integer("quantity").default(1),
  isAddon: boolean("is_addon").default(false),
  category: varchar("category", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ------------------------ proposal_templates (new) --------------------------
export const proposalTemplates = pgTable("proposal_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  content: jsonb("content").$type<Record<string, unknown>>(),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ------------------------- proposal_events (new) ----------------------------
export const proposalEvents = pgTable("proposal_events", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ------------------------ proposal_comments (new) ---------------------------
export const proposalComments = pgTable("proposal_comments", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  author: text("author"),
  authorType: varchar("author_type", { length: 20 }), // client | team
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ----------------------- proposal_acceptance (new) --------------------------
export const proposalAcceptance = pgTable("proposal_acceptance", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  version: integer("version").notNull(),
  decision: varchar("decision", { length: 20 }).notNull(), // accepted | rejected | changes_requested
  clientName: text("client_name"),
  clientEmail: text("client_email"),
  comments: text("comments"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  signature: text("signature"),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --------------------- proposal_payment_milestones (new) --------------------
export const proposalPaymentMilestones = pgTable("proposal_payment_milestones", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  label: text("label").notNull(),
  percent: integer("percent").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp("due_date"),
  status: varchar("status", { length: 20 }).default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================ EXPORTED TYPES =================================
export type Proposal = typeof proposals.$inferSelect;
export type ProposalInsert = typeof proposals.$inferInsert;
export type ProposalEvent = typeof proposalEvents.$inferSelect;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;

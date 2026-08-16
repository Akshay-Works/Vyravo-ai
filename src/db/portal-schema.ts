import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  varchar,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// CLIENT PORTAL schema
// Reuses existing tables: clients, projects, tasks, meetings, proposals,
// invoices, email_queue, activities.
// Only NEW structures are defined here.
// ============================================================================

// ------------------------ client_users (new) --------------------------------
// Portal login users — separate from admin kb_users.
export const clientUsers = pgTable(
  "client_users",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(), // FK -> clients.id
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    jobTitle: text("job_title"),
    timezone: varchar("timezone", { length: 50 }).default("UTC"),
    role: varchar("role", { length: 30 }).notNull().default("owner"),
    // owner | admin | viewer
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").default(true),
    emailVerifiedAt: timestamp("email_verified_at"),
    lastLoginAt: timestamp("last_login_at"),
    invitedBy: integer("invited_by"), // admin user id
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clientIdx: index("cu_client_idx").on(table.clientId),
    emailIdx: index("cu_email_idx").on(table.email),
  })
);

// ------------------------ client_sessions (new) -----------------------------
export const clientSessions = pgTable("client_sessions", {
  id: text("id").primaryKey(), // opaque token
  userId: integer("user_id").notNull(),
  clientId: integer("client_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ------------------------ client_files (new) --------------------------------
export const clientFiles = pgTable(
  "client_files",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    projectId: integer("project_id"),
    uploadedBy: integer("uploaded_by"), // client_user_id or admin
    name: text("name").notNull(),
    originalName: text("original_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storagePath: text("storage_path"),
    category: varchar("category", { length: 50 }).default("general"),
    // general | deliverable | proposal | invoice | contract | other
    accessLevel: varchar("access_level", { length: 30 }).default("client"),
    description: text("description"),
    version: integer("version").default(1),
    isArchived: boolean("is_archived").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    fileClientIdx: index("cf_client_idx").on(table.clientId),
    fileProjectIdx: index("cf_project_idx").on(table.projectId),
  })
);

// ------------------------ client_messages (new) -----------------------------
export const clientMessages = pgTable(
  "client_messages",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    projectId: integer("project_id"),
    ticketId: integer("ticket_id"),
    senderType: varchar("sender_type", { length: 20 }).notNull(), // client | team
    senderName: text("sender_name"),
    senderUserId: integer("sender_user_id"), // client_user_id or admin user id
    content: text("content").notNull(),
    hasAttachments: boolean("has_attachments").default(false),
    isRead: boolean("is_read").default(false),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    msgClientIdx: index("msg_client_idx").on(table.clientId),
    msgProjectIdx: index("msg_project_idx").on(table.projectId),
  })
);

// ------------------------ message_attachments (new) --------------------------
export const messageAttachments = pgTable("message_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  fileName: text("file_name"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ------------------------ notifications (new) --------------------------------
export const clientNotifications = pgTable(
  "client_notifications",
  {
    id: serial("id").primaryKey(),
    clientUserId: integer("client_user_id").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    isRead: boolean("is_read").default(false),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    notifUserIdx: index("notif_user_idx").on(table.clientUserId),
  })
);

// ------------------------ onboarding_tasks (new) -----------------------------
export const onboardingTasks = pgTable(
  "onboarding_tasks",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    projectId: integer("project_id"),
    title: text("title").notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }),
    status: varchar("status", { length: 30 }).default("pending"),
    // pending | completed | skipped
    sortOrder: integer("sort_order").default(0),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ontClientIdx: index("ont_client_idx").on(table.clientId),
  })
);

// ============================ EXPORTED TYPES =================================
export type ClientUser = typeof clientUsers.$inferSelect;
export type ClientFile = typeof clientFiles.$inferSelect;
export type ClientMessage = typeof clientMessages.$inferSelect;
export type Notification = typeof clientNotifications.$inferSelect;
export type OnboardingTask = typeof onboardingTasks.$inferSelect;

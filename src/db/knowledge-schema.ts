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
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";

// ============================================================================
// KNOWLEDGE BASE — Drizzle definitions matching the EXISTING database schema.
//
// These tables already exist in the database (created by the prior KB schema):
//   kb_categories, kb_documents, kb_document_versions, kb_document_blobs,
//   kb_chunks, kb_embeddings, kb_users, kb_sessions, kb_audit_logs
// We reuse them 1:1. Only genuinely NEW structures are created by the setup
// script: kb_knowledge_gaps, kb_queries (and the additive `doc_type` column
// on kb_documents for knowledge-item kinds: article/faq/sop/note/…).
// ============================================================================

// ------------------------- kb_categories (existing) -------------------------
export const kbCategories = pgTable(
  "kb_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    icon: text("icon"),
    parentId: integer("parent_id"),
    sortOrder: integer("sort_order").default(0),
    color: varchar("color", { length: 7 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: uniqueIndex("kb_cat_slug_idx").on(table.slug),
  })
);

// ------------------------- kb_documents (existing) --------------------------
// `doc_type` is ADDED by the setup script (additive, non-destructive).
export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: serial("id").primaryKey(),
    spaceId: integer("space_id"), // tenant/client isolation
    title: text("title").notNull(),
    sourceType: varchar("source_type", { length: 50 }), // pdf | docx | txt | md | csv | xlsx | url | manual
    sourceUri: text("source_uri"), // original URL or file ref
    categoryId: integer("category_id"),
    tags: jsonb("tags").$type<string[]>(),
    accessLevel: varchar("access_level", { length: 30 }).notNull().default("internal"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    version: integer("version").notNull().default(1),
    publishedVersion: integer("published_version"),
    currentVersionId: integer("current_version_id"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    checksum: text("checksum"),
    summary: text("summary"),
    keyTopics: jsonb("key_topics").$type<string[]>(),
    importantFacts: jsonb("important_facts").$type<string[]>(),
    suggestedFaqs: jsonb("suggested_faqs").$type<string[]>(),
    suggestedCategory: text("suggested_category"),
    suggestedTags: jsonb("suggested_tags").$type<string[]>(),
    enrichmentStatus: varchar("enrichment_status", { length: 30 }).default("none"),
    enrichmentApproved: boolean("enrichment_approved").default(false),
    processingStatus: varchar("processing_status", { length: 30 }).default("pending"),
    processingStage: varchar("processing_stage", { length: 50 }),
    processingError: text("processing_error"),
    processingAttempts: integer("processing_attempts").default(0),
    chunkCount: integer("chunk_count").default(0),
    tokenCount: integer("token_count").default(0),
    embeddingProvider: varchar("embedding_provider", { length: 50 }),
    embeddingModel: varchar("embedding_model", { length: 100 }),
    indexedAt: timestamp("indexed_at"),
    retrievalCount: integer("retrieval_count").default(0),
    lastRetrievedAt: timestamp("last_retrieved_at"),
    isArchived: boolean("is_archived").default(false),
    publishedAt: timestamp("published_at"),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    // ADDED by setup script — knowledge-item kind (article/faq/sop/note/…)
    docType: varchar("doc_type", { length: 50 }).default("document"),
  },
  (table) => ({
    statusIdx: index("kb_doc_status_idx").on(table.status),
    categoryIdx: index("kb_doc_category_idx").on(table.categoryId),
    accessIdx: index("kb_doc_access_idx").on(table.accessLevel),
    spaceIdx: index("kb_doc_space_idx").on(table.spaceId),
  })
);

// -------------------- kb_document_versions (existing) -----------------------
export const kbDocumentVersions = pgTable("kb_document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  contentHash: text("content_hash"),
  status: varchar("status", { length: 20 }),
  accessLevel: varchar("access_level", { length: 30 }),
  categoryId: integer("category_id"),
  tags: jsonb("tags").$type<string[]>(),
  changeSummary: text("change_summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --------------------- kb_document_blobs (existing) -------------------------
// Original uploaded file bytes — the source document is never lost.
export const kbDocumentBlobs = pgTable("kb_document_blobs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  byteSize: integer("byte_size"),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --------------------------- kb_chunks (existing) ---------------------------
export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id").notNull(),
    versionId: integer("version_id"),
    spaceId: integer("space_id"),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash"),
    tokenCount: integer("token_count"),
    heading: text("heading"),
    sectionPath: text("section_path"),
    pageNumber: integer("page_number"),
    chunkType: varchar("chunk_type", { length: 30 }).default("text"),
    documentTitle: text("document_title"),
    categoryId: integer("category_id"),
    categorySlug: text("category_slug"),
    accessLevel: varchar("access_level", { length: 30 }),
    status: varchar("status", { length: 20 }).default("active"),
    sourceUri: text("source_uri"),
    docVersion: integer("doc_version").default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    tsv: text("tsv"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    documentIdx: index("kb_chunk_doc_idx").on(table.documentId),
    categoryIdx: index("kb_chunk_cat_idx").on(table.categoryId),
    accessIdx: index("kb_chunk_access_idx").on(table.accessLevel),
    spaceIdx: index("kb_chunk_space_idx").on(table.spaceId),
  })
);

// ------------------------- kb_embeddings (existing) -------------------------
// The `embedding` pgvector column is managed via raw SQL (Drizzle has no
// native vector type); we define the metadata columns here.
export const kbEmbeddings = pgTable(
  "kb_embeddings",
  {
    id: serial("id").primaryKey(),
    chunkId: integer("chunk_id").notNull(),
    documentId: integer("document_id").notNull(),
    spaceId: integer("space_id"),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    dim: integer("dim").notNull(),
    // embedding_json added by setup (JSONB fallback when pgvector unavailable)
    embeddingJson: jsonb("embedding_json").$type<number[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    chunkIdx: index("kb_emb_chunk_idx").on(table.chunkId),
    documentIdx: index("kb_emb_doc_idx").on(table.documentId),
    spaceIdx: index("kb_emb_space_idx").on(table.spaceId),
  })
);

// --------------------------- kb_users (existing) ----------------------------
export const kbUsers = pgTable("kb_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 30 }).notNull().default("admin"),
  spaceId: integer("space_id"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --------------------------- kb_sessions (existing) -------------------------
export const kbSessions = pgTable("kb_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  expiresAt: timestamp("expires_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// -------------------------- kb_audit_logs (existing) ------------------------
export const kbAuditLogs = pgTable("kb_audit_logs", {
  id: serial("id").primaryKey(),
  spaceId: integer("space_id"),
  actorId: integer("actor_id"),
  actorEmail: text("actor_email"),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// NEW TABLES (created by setup script — do not exist in the database yet)
// ============================================================================

// ------------------------- kb_knowledge_gaps (new) --------------------------
export const kbKnowledgeGaps = pgTable("kb_knowledge_gaps", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  frequency: integer("frequency").default(1),
  category: text("category"),
  source: varchar("source", { length: 50 }),
  status: varchar("status", { length: 30 }).default("open"),
  suggestedAction: text("suggested_action"),
  resolvedByDocumentId: integer("resolved_by_document_id"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// --------------------------- kb_queries (new) -------------------------------
export const kbQueries = pgTable("kb_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  queryType: varchar("query_type", { length: 20 }).notNull(),
  resultsCount: integer("results_count").default(0),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  answered: boolean("answered").default(false),
  answerSatisfactory: boolean("answer_satisfactory"),
  gapCreated: boolean("gap_created").default(false),
  sourceDocuments: jsonb("source_documents").$type<{ id: number; title: string }[]>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================ EXPORTED TYPES =================================
export type KbDocument = typeof kbDocuments.$inferSelect;
export type KbDocumentInsert = typeof kbDocuments.$inferInsert;
export type KbChunk = typeof kbChunks.$inferSelect;
export type KbCategory = typeof kbCategories.$inferSelect;
export type KbKnowledgeGap = typeof kbKnowledgeGaps.$inferSelect;
export type KbQuery = typeof kbQueries.$inferSelect;

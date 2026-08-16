import { pgTable, serial, text, timestamp, boolean, integer, jsonb, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";

// ============================================================================
// WORKFLOW ENGINE schema — reliable, idempotent event-driven orchestration.
// ============================================================================

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    eventId: text("event_id"), // external idempotency key (e.g. payment event id, proposal id + action)
    workflowKey: varchar("workflow_key", { length: 80 }).notNull(), // deterministic key for idempotency
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    // pending | running | completed | failed | retrying | cancelled
    clientId: integer("client_id"),
    leadId: integer("lead_id"),
    projectId: integer("project_id"),
    trigger: jsonb("trigger").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attemptCount: integer("attempt_count").default(0),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    statusIdx: index("wf_status_idx").on(table.status),
    clientIdx: index("wf_client_idx").on(table.clientId),
    // Idempotency: a given workflow key can only run once.
    keyUnique: uniqueIndex("wf_key_unique").on(table.workflowKey),
  })
);

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;

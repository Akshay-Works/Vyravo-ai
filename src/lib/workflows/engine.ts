// Unified Workflow Engine
// Event-driven orchestration layer connecting ALL Vyravo AI systems.
//
// - runWorkflow(eventType, payload) is idempotent (unique workflow_key)
// - Each handler runs with try/catch + retry with backoff
// - A failed handler NEVER breaks the caller — the workflow record stores
//   the error and can be retried independently
// - Uses the existing email_queue, activities, analytics_events, invoices,
//   clients, client_users, projects tables — no duplicate infrastructure

import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { pool, db } from "@/db";
import { workflowExecutions } from "@/db/workflow-schema";
import { leads, clients, projects, invoices, activities, emailQueue, meetings, tasks } from "@/db/schema";
import { proposals } from "@/db/proposal-schema";
import { clientUsers, clientFiles, onboardingTasks } from "@/db/portal-schema";
import { trackEvent } from "@/lib/analytics/events";
import { sendProposalEmail, buildProposalEmailPayload } from "@/lib/proposals/email";
import { createClientSession } from "@/lib/portal/auth";
import { hashPassword } from "@/lib/portal/auth";
import { proposalNumber } from "@/lib/proposals/format";

export const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 30_000;

let ensured: Promise<void> | null = null;
export function ensureWorkflowTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS workflow_executions (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(80) NOT NULL,
        event_id TEXT,
        workflow_key VARCHAR(80) NOT NULL UNIQUE,
        status VARCHAR(30) DEFAULT 'pending' NOT NULL,
        client_id INTEGER, lead_id INTEGER, project_id INTEGER,
        trigger JSONB, result JSONB,
        attempt_count INTEGER DEFAULT 0,
        last_error TEXT,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL,
        completed_at TIMESTAMP
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS wf_status_idx ON workflow_executions(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS wf_client_idx ON workflow_executions(client_id)`);
    })().catch((e) => console.error("ensureWorkflowTables failed:", e));
  }
  return ensured!;
}
async function fix() {}

// ---------------------------------------------------------------------------
// Event emission — the single entry point for lifecycle events
// ---------------------------------------------------------------------------
export async function emitEvent(
  eventType: string,
  payload: {
    clientId?: number;
    leadId?: number;
    projectId?: number;
    proposalId?: number;
    invoiceId?: number;
    paymentId?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await ensureWorkflowTables();
    const key = workflowKey(eventType, payload);
    const existing = await db
      .select({ id: workflowExecutions.id })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowKey, key))
      .limit(1);
    if (existing.length > 0) return; // idempotent — already processed

    await db.insert(workflowExecutions).values({
      eventType,
      eventId: payload.paymentId || payload.proposalId ? String(payload.proposalId || payload.paymentId) : null,
      workflowKey: key,
      status: "pending",
      clientId: payload.clientId || null,
      leadId: payload.leadId || null,
      projectId: payload.projectId || null,
      trigger: { ...payload } as any,
    });

    // Fire-and-forget execution (best-effort, never blocks the caller)
    void executeWorkflow(key).catch((e) => console.error(`Workflow ${key} error:`, e));
  } catch (e) {
    console.error("emitEvent error:", e);
  }
}

function workflowKey(eventType: string, payload: any): string {
  const parts = [eventType];
  if (payload.clientId) parts.push(`c${payload.clientId}`);
  if (payload.leadId) parts.push(`l${payload.leadId}`);
  if (payload.proposalId) parts.push(`p${payload.proposalId}`);
  if (payload.invoiceId) parts.push(`i${payload.invoiceId}`);
  if (payload.paymentId) parts.push(`pay${payload.paymentId}`);
  parts.push(payload.metadata?.nonce || "");
  return parts.join(":");
}

async function executeWorkflow(key: string): Promise<void> {
  await ensureWorkflowTables();
  const rows = await db.select().from(workflowExecutions).where(eq(workflowExecutions.workflowKey, key)).limit(1);
  if (rows.length === 0) return;
  const exec = rows[0];

  await db.update(workflowExecutions).set({ status: "running", updatedAt: new Date() }).where(eq(workflowExecutions.id, exec.id));

  const payload = (exec.trigger || {}) as any;
  try {
    const result = await dispatchWorkflow(exec.eventType, payload);
    await db.update(workflowExecutions).set({
      status: "completed",
      result: (result || {}) as any,
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    }).where(eq(workflowExecutions.id, exec.id));
  } catch (e: any) {
    const attempts = (exec.attemptCount || 0) + 1;
    const error = String(e?.message || e);
    if (attempts < MAX_ATTEMPTS) {
      await db.update(workflowExecutions).set({
        status: "retrying",
        attemptCount: attempts,
        lastError: error,
        nextRetryAt: new Date(Date.now() + RETRY_BASE_MS * attempts),
        updatedAt: new Date(),
      }).where(eq(workflowExecutions.id, exec.id));
      setTimeout(() => void executeWorkflow(key), RETRY_BASE_MS * attempts);
    } else {
      await db.update(workflowExecutions).set({
        status: "failed",
        attemptCount: attempts,
        lastError: error,
        updatedAt: new Date(),
      }).where(eq(workflowExecutions.id, exec.id));
    }
    console.error(`Workflow ${key} failed:`, error);
  }
}

// ---------------------------------------------------------------------------
// Workflow handlers — one per lifecycle event
// ---------------------------------------------------------------------------
async function dispatchWorkflow(eventType: string, payload: any): Promise<Record<string, unknown>> {
  switch (eventType) {
    case "lead_created": return handleLeadCreated(payload);
    case "lead_qualified": return handleLeadQualified(payload);
    case "call_booked": return handleCallBooked(payload);
    case "proposal_sent": return handleProposalSent(payload);
    case "proposal_viewed": return handleProposalViewed(payload);
    case "proposal_accepted": return handleProposalAccepted(payload);
    case "invoice_created": return handleInvoiceCreated(payload);
    case "payment_received": return handlePaymentReceived(payload);
    case "client_created": return handleClientCreated(payload);
    case "project_created": return handleProjectCreated(payload);
    case "milestone_completed": return handleMilestoneCompleted(payload);
    case "deliverable_uploaded": return handleDeliverableUploaded(payload);
    case "support_ticket_created": return handleSupportTicketCreated(payload);
    case "project_completed": return handleProjectCompleted(payload);
    default:
      await logActivityFor(payload, "system", "Event received", `Workflow: ${eventType}`);
      return { handled: false, note: "No handler registered" };
  }
}

async function handleLeadCreated(payload: any) {
  await logActivityFor(payload, "lead", "New lead received", payload.metadata?.source ? `Lead source: ${payload.metadata.source}` : "A new lead entered the CRM.");
  await trackEvent("lead_created", { leadId: payload.leadId, clientId: payload.clientId, metadata: payload.metadata });
  return { ok: true };
}

async function handleLeadQualified(payload: any) {
  await logActivityFor(payload, "lead", "Lead qualified", "Lead was qualified for a discovery call.");
  await trackEvent("lead_qualified", { leadId: payload.leadId, clientId: payload.clientId });
  return { ok: true };
}

async function handleCallBooked(payload: any) {
  await logActivityFor(payload, "call", "Discovery call booked", payload.metadata?.when ? `Scheduled for ${payload.metadata.when}` : "A discovery call was booked.");
  await trackEvent("call_booked", { leadId: payload.leadId, clientId: payload.clientId });
  return { ok: true };
}

async function handleProposalSent(payload: any) {
  await logActivityFor(payload, "proposal", "Proposal sent", payload.metadata?.title ? `Proposal: ${payload.metadata.title}` : "A proposal was sent to the client.");
  await trackEvent("proposal_sent", { leadId: payload.leadId, clientId: payload.clientId, value: payload.metadata?.value });
  return { ok: true };
}

async function handleProposalViewed(payload: any) {
  await logActivityFor(payload, "proposal", "Proposal viewed", "The client viewed the proposal.");
  await trackEvent("proposal_viewed", { leadId: payload.leadId, clientId: payload.clientId });
  return { ok: true };
}

async function handleInvoiceCreated(payload: any) {
  await logActivityFor(payload, "invoice", "Invoice created", payload.metadata?.number ? `Invoice ${payload.metadata.number}` : "An invoice was created.");
  await trackEvent("invoice_created", { clientId: payload.clientId, value: payload.metadata?.value });
  return { ok: true };
}

/** THE central downstream workflow — proposal accepted triggers everything. */
async function handleProposalAccepted(payload: any) {
  const proposalId = payload.proposalId;
  if (!proposalId) throw new Error("proposalId required");
  const rows = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (rows.length === 0) throw new Error("Proposal not found");
  const p = rows[0];

  const result: Record<string, unknown> = {};

  // 1) Invoice (idempotent — check existing)
  const total = Number(p.total || 0);
  const invNum = `INV-${String(proposalId).padStart(4, "0")}`;
  const existingInv = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, invNum)).limit(1);
  if (existingInv.length === 0) {
    let clientId = p.clientId;
    if (!clientId) {
      const c = await pool.query(
        `INSERT INTO clients (company_name, primary_contact_name, primary_contact_email, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [p.companyName || p.clientName || "Client", p.clientName || "Client", p.clientEmail || "client@unknown.local"]
      );
      clientId = Number(c.rows[0].id);
      await db.update(proposals).set({ clientId }).where(eq(proposals.id, proposalId));
    }
    const inv = await pool.query(
      `INSERT INTO invoices (number, client_id, issue_date, due_date, status, subtotal, total, amount_due)
       VALUES ($1, $2, now(), now() + interval '14 days', 'sent', $3, $4, $4) RETURNING id`,
      [invNum, clientId, total, total]
    );
    result.invoiceId = Number(inv.rows[0].id);
    await emitEvent("invoice_created", { clientId, invoiceId: result.invoiceId as number, metadata: { number: invNum, value: total } });
  } else {
    result.invoiceId = existingInv[0].id;
  }

  // 2) Client portal account (idempotent by email)
  if (p.clientEmail) {
    const existingUser = await db.select({ id: clientUsers.id }).from(clientUsers).where(eq(clientUsers.email, p.clientEmail)).limit(1);
    if (existingUser.length === 0) {
      const passwordHash = hashPassword(`Vyravo-${Math.random().toString(36).slice(2, 10)}!`);
      const clientId = p.clientId || result.invoiceId ? await resolveClientId(p) : await resolveClientId(p);
      const user = await pool.query(
        `INSERT INTO client_users (client_id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, 'owner') RETURNING id`,
        [clientId, p.clientEmail, p.clientName || p.clientEmail, passwordHash]
      );
      result.portalUserId = Number(user.rows[0].id);
      await emitEvent("client_created", { clientId, metadata: { email: p.clientEmail } });
    }
  }

  // 3) Project + milestones + onboarding (idempotent by proposal)
  const existingProj = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, `Project: ${p.title}`)).limit(1);
  if (existingProj.length === 0 && p.clientId) {
    const proj = await db.insert(projects).values({
      name: `Project: ${p.title}`,
      description: `Initiated from accepted proposal ${p.number || proposalId}.`,
      clientId: p.clientId,
      status: "planning",
      startDate: new Date().toISOString().slice(0, 10) as any,
      progress: 0,
      milestones: [
        { name: "Discovery & Requirements", status: "in_progress", description: "Confirm requirements and kickoff." },
        { name: "Planning & Design", status: "pending", description: "Solution architecture and design." },
        { name: "Development", status: "pending", description: "Build the agreed systems." },
        { name: "Testing & Review", status: "pending", description: "QA and client review." },
        { name: "Deployment & Handover", status: "pending", description: "Launch, training, and support." },
      ],
    }).returning({ id: projects.id });
    const projectId = Number(proj[0].id);
    result.projectId = projectId;
    await emitEvent("project_created", { clientId: p.clientId || undefined, projectId });
  }

  // 4) Analytics + activity
  await logActivityFor(payload, "proposal", "Proposal accepted", `Proposal ${p.number || proposalId} accepted by ${p.clientName || "client"}.`);
  await trackEvent("proposal_accepted", { leadId: p.leadId || undefined, clientId: p.clientId || undefined, value: total });

  // 5) CRM (best-effort — HubSpot)
  try {
    if (p.clientEmail) {
      const { updateDealStageForEmail } = await import("@/lib/integrations/hubspot");
      await updateDealStageForEmail(p.clientEmail, ["Proposal Accepted", "Contract Sent"]);
    }
  } catch (e) { console.warn("CRM update after acceptance failed:", e); }

  return result;
}

async function resolveClientId(p: any): Promise<number> {
  if (p.clientId) return p.clientId;
  const c = await pool.query(
    `SELECT id FROM clients WHERE primary_contact_email = $1 LIMIT 1`,
    [p.clientEmail || ""]
  );
  if ((c.rowCount ?? 0) > 0) return Number(c.rows[0].id);
  const ins = await pool.query(
    `INSERT INTO clients (company_name, primary_contact_name, primary_contact_email, status)
     VALUES ($1, $2, $3, 'active') RETURNING id`,
    [p.companyName || "Client", p.clientName || "Client", p.clientEmail || "client@unknown.local"]
  );
  return Number(ins.rows[0].id);
}

async function handlePaymentReceived(payload: any) {
  // Idempotent by paymentId (workflowKey already ensures this)
  let invoiceId = payload.invoiceId;
  if (payload.paymentId) {
    // mark invoice paid if we can find it
    const inv = payload.invoiceId ? await db.select().from(invoices).where(eq(invoices.id, Number(payload.invoiceId))).limit(1) : [];
    if (inv.length) {
      await db.update(invoices).set({ status: "paid", paidAt: new Date(), amountPaid: inv[0].total, amountDue: "0" }).where(eq(invoices.id, Number(payload.invoiceId)));
    }
    invoiceId = payload.invoiceId;
  }
  await logActivityFor(payload, "payment", "Payment received", payload.metadata?.amount ? `Payment of ${payload.metadata.amount} received.` : "Payment received.");
  await trackEvent("payment_received", { clientId: payload.clientId, value: payload.metadata?.amount ? Number(payload.metadata.amount) : undefined });
  return { ok: true, invoiceId };
}

async function handleClientCreated(payload: any) {
  await logActivityFor(payload, "client", "Client portal activated", payload.metadata?.email ? `Portal account created for ${payload.metadata.email}.` : "Client portal activated.");
  await trackEvent("client_created", { clientId: payload.clientId });
  return { ok: true };
}

async function handleProjectCreated(payload: any) {
  const projectId = payload.projectId;
  if (!projectId) throw new Error("projectId required");
  // Onboarding checklist
  const existingTasks = await db.select({ id: onboardingTasks.id }).from(onboardingTasks).where(eq(onboardingTasks.projectId, projectId)).limit(1);
  if (existingTasks.length === 0 && payload.clientId) {
    const checklist = [
      { title: "Account Setup", category: "setup", sortOrder: 0 },
      { title: "Company Information", category: "setup", sortOrder: 1 },
      { title: "Business Requirements", category: "requirements", sortOrder: 2 },
      { title: "Brand Assets", category: "assets", sortOrder: 3 },
      { title: "Software Access", category: "access", sortOrder: 4 },
      { title: "Integration Credentials", category: "access", sortOrder: 5 },
      { title: "Project Confirmation", category: "kickoff", sortOrder: 6 },
      { title: "Kickoff Meeting", category: "kickoff", sortOrder: 7 },
    ];
    for (const t of checklist) {
      await db.insert(onboardingTasks).values({ clientId: payload.clientId, projectId, title: t.title, category: t.category, sortOrder: t.sortOrder });
    }
  }
  await logActivityFor(payload, "project", "Project created", "Project and onboarding checklist created.");
  await trackEvent("project_created", { clientId: payload.clientId, projectId });
  return { ok: true };
}

async function handleMilestoneCompleted(payload: any) {
  await logActivityFor(payload, "project", "Milestone completed", payload.metadata?.milestone ? `Milestone completed: ${payload.metadata.milestone}` : "A project milestone was completed.");
  await trackEvent("milestone_completed", { clientId: payload.clientId, projectId: payload.projectId });
  return { ok: true };
}

async function handleDeliverableUploaded(payload: any) {
  await logActivityFor(payload, "file", "Deliverable uploaded", payload.metadata?.name ? `Deliverable ready: ${payload.metadata.name}` : "A deliverable was uploaded.");
  await trackEvent("deliverable_uploaded", { clientId: payload.clientId, projectId: payload.projectId });
  return { ok: true };
}

async function handleSupportTicketCreated(payload: any) {
  await logActivityFor(payload, "ticket", "Support request created", payload.metadata?.title ? `Ticket: ${payload.metadata.title}` : "A support request was created.");
  await trackEvent("support_ticket_created", { clientId: payload.clientId });
  return { ok: true };
}

async function handleProjectCompleted(payload: any) {
  await logActivityFor(payload, "project", "Project completed", "Project completed successfully.");
  await trackEvent("project_completed", { clientId: payload.clientId, projectId: payload.projectId });
  return { ok: true };
}

async function logActivityFor(payload: any, type: string, action: string, description?: string) {
  try {
    if (payload.clientId) {
      await db.insert(activities).values({ clientId: payload.clientId, type: type as any, action, description: description || action });
    }
  } catch (e) { console.error("workflow activity log error:", e); }
}

// ---------------------------------------------------------------------------
// Monitoring + retry
// ---------------------------------------------------------------------------
export async function listWorkflowExecutions(opts: { status?: string; limit?: number } = {}) {
  await ensureWorkflowTables();
  const limit = Math.min(opts.limit || 50, 200);
  const filters: any[] = [];
  if (opts.status) filters.push(eq(workflowExecutions.status, opts.status as any));
  const where = filters.length ? and(...filters) : undefined;
  return db.select().from(workflowExecutions).where(where).orderBy(desc(workflowExecutions.createdAt)).limit(limit);
}

export async function retryWorkflow(id: number): Promise<boolean> {
  await ensureWorkflowTables();
  const rows = await db.select().from(workflowExecutions).where(eq(workflowExecutions.id, id)).limit(1);
  if (rows.length === 0) return false;
  const exec = rows[0];
  if (exec.status !== "failed" && exec.status !== "retrying") return false;
  await db.update(workflowExecutions).set({ status: "pending", attemptCount: 0, lastError: null, nextRetryAt: null, updatedAt: new Date() }).where(eq(workflowExecutions.id, id));
  void executeWorkflow(exec.workflowKey);
  return true;
}

export async function retryFailedWorkflows(): Promise<number> {
  await ensureWorkflowTables();
  const failed = await db.select().from(workflowExecutions).where(eq(workflowExecutions.status, "failed")).limit(50);
  let n = 0;
  for (const f of failed) {
    await db.update(workflowExecutions).set({ status: "pending", attemptCount: 0, lastError: null, updatedAt: new Date() }).where(eq(workflowExecutions.id, f.id));
    void executeWorkflow(f.workflowKey);
    n++;
  }
  return n;
}

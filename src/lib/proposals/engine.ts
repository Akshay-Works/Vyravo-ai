// Proposal Automation — engine
// CRUD, duplicate, status transitions, events, comments, acceptance,
// analytics and secure client tokens. Reuses the existing `proposals` table.

import { eq, and, desc, sql, count, or, lt } from "drizzle-orm";
import { randomBytes } from "crypto";
import { pool, db } from "@/db";
import {
  proposals,
  proposalVersions,
  proposalItems,
  proposalEvents,
  proposalComments,
  proposalAcceptance,
  proposalPaymentMilestones,
} from "@/db/proposal-schema";
import type {
  ProposalStatus,
  ProposalEventType,
  ProposalContent,
  ProposalAnalytics,
} from "./types";
import { proposalNumber, expiryDate } from "./format";

export const PROPOSAL_STATUSES: ProposalStatus[] = [
  "draft", "in_review", "approved", "sent", "viewed", "accepted",
  "rejected", "changes_requested", "expired", "archived",
];

// ---------------------------------------------------------------------------
// Lazy schema bootstrap (additive columns + new tables)
// ---------------------------------------------------------------------------
let ensured: Promise<void> | null = null;

export function ensureProposalTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const columns: [string, string][] = [
        ["version", "INTEGER DEFAULT 1"],
        ["client_name", "TEXT"], ["company_name", "TEXT"], ["client_email", "TEXT"],
        ["client_phone", "TEXT"], ["client_website", "TEXT"], ["industry", "TEXT"],
        ["secure_token", "VARCHAR(64)"], ["project_description", "TEXT"],
        ["business_problems", "JSONB"], ["goals", "JSONB"], ["requirements", "JSONB"],
        ["selected_services", "JSONB"], ["proposal_content", "JSONB"],
        ["payment_terms", "TEXT"], ["support_terms", "TEXT"],
        ["expiry_days", "INTEGER DEFAULT 14"], ["generated_by_ai", "BOOLEAN DEFAULT false"],
        ["ai_status", "VARCHAR(30)"], ["last_activity_at", "TIMESTAMP"],
        ["archived_at", "TIMESTAMP"], ["follow_up_stage", "INTEGER DEFAULT 0"],
        ["notes", "TEXT"], ["changes_requested_at", "TIMESTAMP"],
        ["total_viewed", "INTEGER DEFAULT 0"],
      ];
      for (const [name, ddl] of columns) {
        await pool.query(`ALTER TABLE proposals ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
      }
      const tables: [string, string][] = [
        ["proposal_versions", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, version INTEGER NOT NULL,
          title TEXT, content JSONB, summary TEXT, total DECIMAL(10,2), status VARCHAR(50),
          changed_by INTEGER, change_note TEXT, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_items", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, sort_order INTEGER DEFAULT 0,
          name TEXT NOT NULL, description TEXT, service_type VARCHAR(50),
          implementation_fee DECIMAL(10,2) DEFAULT 0, monthly_recurring DECIMAL(10,2) DEFAULT 0,
          quantity INTEGER DEFAULT 1, is_addon BOOLEAN DEFAULT false, category VARCHAR(50),
          created_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_templates", `(
          id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug VARCHAR(100) NOT NULL UNIQUE,
          description TEXT, category VARCHAR(50), content JSONB, is_default BOOLEAN DEFAULT false,
          is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT now() NOT NULL,
          updated_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_events", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, event_type VARCHAR(50) NOT NULL,
          metadata JSONB, ip_address TEXT, user_agent TEXT,
          created_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_comments", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, author TEXT,
          author_type VARCHAR(20), content TEXT NOT NULL, metadata JSONB,
          created_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_acceptance", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, version INTEGER NOT NULL,
          decision VARCHAR(20) NOT NULL, client_name TEXT, client_email TEXT, comments TEXT,
          ip_address TEXT, user_agent TEXT, signature TEXT,
          signed_at TIMESTAMP DEFAULT now() NOT NULL, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
        ["proposal_payment_milestones", `(
          id SERIAL PRIMARY KEY, proposal_id INTEGER NOT NULL, label TEXT NOT NULL,
          percent INTEGER NOT NULL, amount DECIMAL(10,2) NOT NULL, due_date TIMESTAMP,
          status VARCHAR(20) DEFAULT 'pending', paid_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT now() NOT NULL)`],
      ];
      for (const [name, ddl] of tables) {
        await pool.query(`CREATE TABLE IF NOT EXISTS ${name} ${ddl}`);
      }
    })().catch((e) => console.error("ensureProposalTables failed:", e));
  }
  return ensured;
}

// ---------------------------------------------------------------------------
// Secure tokens
// ---------------------------------------------------------------------------
export function generateSecureToken(): string {
  return randomBytes(24).toString("hex"); // 48-char, non-guessable
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export interface CreateProposalInput {
  title: string;
  clientName?: string;
  companyName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientWebsite?: string;
  industry?: string;
  leadId?: number;
  clientId?: number;
  projectDescription?: string;
  businessProblems?: string[];
  goals?: string[];
  requirements?: string[];
  summary?: string;
  templateId?: number;
  templateContent?: ProposalContent | null;
  content?: ProposalContent | null;
  paymentTerms?: string;
  supportTerms?: string;
  expiryDays?: number;
  notes?: string;
}

export async function createProposal(input: CreateProposalInput): Promise<number> {
  await ensureProposalTables();

  const content = input.content || input.templateContent || null;
  const totals = content ? computeTotals(content) : { subtotal: 0, total: 0, tax: 0, discount: 0 };
  const expiry = input.expiryDays ?? (content?.expiryDays) ?? 14;

  const inserted = await db
    .insert(proposals)
    .values({
      title: input.title.trim(),
      clientName: input.clientName || null,
      companyName: input.companyName || null,
      clientEmail: input.clientEmail || null,
      clientPhone: input.clientPhone || null,
      clientWebsite: input.clientWebsite || null,
      industry: input.industry || null,
      leadId: input.leadId || null,
      clientId: input.clientId || null,
      projectDescription: input.projectDescription || null,
      businessProblems: input.businessProblems || null,
      goals: input.goals || null,
      requirements: input.requirements || null,
      summary: input.summary || content?.sections?.find((s) => s.id === "executive_summary")?.content || null,
      proposalContent: content as any,
      paymentTerms: input.paymentTerms || content?.paymentTerms || null,
      supportTerms: input.supportTerms || content?.supportTerms || null,
      expiryDays: expiry,
      status: "draft",
      currency: content?.pricing?.currency || "USD",
      subtotal: String(totals.subtotal),
      discount: String(totals.discount),
      tax: String(totals.tax),
      total: String(totals.total),
      secureToken: generateSecureToken(),
      aiStatus: "none",
      followUpStage: 0,
      totalViewed: 0,
    })
    .returning({ id: proposals.id, createdAt: proposals.createdAt });

  const proposalId = inserted[0].id;

  // Number
  await db
    .update(proposals)
    .set({ number: proposalNumber(proposalId) })
    .where(eq(proposals.id, proposalId));

  // Version 1
  await db.insert(proposalVersions).values({
    proposalId,
    version: 1,
    title: input.title.trim(),
    content: content as any,
    summary: input.summary || null,
    total: String(totals.total),
    status: "draft",
    changeNote: "Initial version",
  });

  // Items from content services
  if (content?.services?.length) {
    for (const [i, svc] of content.services.entries()) {
      await db.insert(proposalItems).values({
        proposalId,
        sortOrder: i,
        name: svc.name,
        description: svc.description || null,
        serviceType: svc.id || null,
        implementationFee: String(svc.implementationFee ?? 0),
        monthlyRecurring: String(svc.monthlyRecurring ?? 0),
        quantity: svc.quantity ?? 1,
        isAddon: !!svc.isAddon,
      });
    }
  }

  // Payment milestones
  if (content?.milestones?.length) {
    for (const m of content.milestones) {
      await db.insert(proposalPaymentMilestones).values({
        proposalId,
        label: m.label,
        percent: m.percent,
        amount: String(m.amount),
        status: "pending",
      });
    }
  }

  await recordEvent(proposalId, "created", { title: input.title });
  return proposalId;
}

// ---------------------------------------------------------------------------
// Compute totals from content
// ---------------------------------------------------------------------------
export function computeTotals(content: ProposalContent): {
  subtotal: number; discount: number; tax: number; total: number; monthlyTotal: number;
} {
  const pricing = content.pricing || {
    currency: "USD", implementation: 0, monthlyRetainer: 0, addons: [], discount: 0, taxRate: 0, total: 0, monthlyTotal: 0,
  };
  const implementation = pricing.implementation || 0;
  const addons = (pricing.addons || []).reduce((s, a) => s + (a.price || 0), 0);
  const subtotal = implementation + addons;
  const discount = pricing.discount || 0;
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = afterDiscount * ((pricing.taxRate || 0) / 100);
  const total = Math.round((afterDiscount + tax) * 100) / 100;
  const monthlyTotal = pricing.monthlyRetainer || 0;
  return { subtotal, discount, tax, total, monthlyTotal };
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------
export async function getProposal(id: number) {
  await ensureProposalTables();
  const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (rows.length === 0) return null;
  const p = rows[0];
  const [versions, items, events, comments, milestones, acceptance] = await Promise.all([
    db.select().from(proposalVersions).where(eq(proposalVersions.proposalId, id)).orderBy(desc(proposalVersions.version)),
    db.select().from(proposalItems).where(eq(proposalItems.proposalId, id)).orderBy(proposalItems.sortOrder),
    db.select().from(proposalEvents).where(eq(proposalEvents.proposalId, id)).orderBy(desc(proposalEvents.createdAt)),
    db.select().from(proposalComments).where(eq(proposalComments.proposalId, id)).orderBy(desc(proposalComments.createdAt)),
    db.select().from(proposalPaymentMilestones).where(eq(proposalPaymentMilestones.proposalId, id)).orderBy(proposalPaymentMilestones.percent),
    db.select().from(proposalAcceptance).where(eq(proposalAcceptance.proposalId, id)).orderBy(desc(proposalAcceptance.createdAt)),
  ]);
  return { proposal: p, versions, items, events, comments, milestones, acceptance };
}

export async function getProposalByToken(token: string) {
  await ensureProposalTables();
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.secureToken, token), sql`${proposals.archivedAt} IS NULL`))
    .limit(1);
  return rows.length ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Update (with versioning)
// ---------------------------------------------------------------------------
export async function updateProposal(
  id: number,
  patch: Partial<{
    title: string;
    clientName: string; companyName: string; clientEmail: string; clientPhone: string; clientWebsite: string;
    industry: string; projectDescription: string; businessProblems: string[]; goals: string[]; requirements: string[];
    summary: string; content: ProposalContent; paymentTerms: string; supportTerms: string;
    expiryDays: number; notes: string; status: ProposalStatus;
  }>,
  changeNote = "Updated"
): Promise<boolean> {
  await ensureProposalTables();
  const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (rows.length === 0) return false;
  const current = rows[0];

  const next: Record<string, unknown> = {
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.clientName !== undefined) next.clientName = patch.clientName;
  if (patch.companyName !== undefined) next.companyName = patch.companyName;
  if (patch.clientEmail !== undefined) next.clientEmail = patch.clientEmail;
  if (patch.clientPhone !== undefined) next.clientPhone = patch.clientPhone;
  if (patch.clientWebsite !== undefined) next.clientWebsite = patch.clientWebsite;
  if (patch.industry !== undefined) next.industry = patch.industry;
  if (patch.projectDescription !== undefined) next.projectDescription = patch.projectDescription;
  if (patch.businessProblems !== undefined) next.businessProblems = patch.businessProblems;
  if (patch.goals !== undefined) next.goals = patch.goals;
  if (patch.requirements !== undefined) next.requirements = patch.requirements;
  if (patch.summary !== undefined) next.summary = patch.summary;
  if (patch.paymentTerms !== undefined) next.paymentTerms = patch.paymentTerms;
  if (patch.supportTerms !== undefined) next.supportTerms = patch.supportTerms;
  if (patch.expiryDays !== undefined) next.expiryDays = patch.expiryDays;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.status !== undefined) next.status = patch.status;

  let content = current.proposalContent as ProposalContent | null;
  if (patch.content) {
    content = patch.content;
    next.proposalContent = content;
    const totals = computeTotals(content);
    next.subtotal = String(totals.subtotal);
    next.discount = String(totals.discount);
    next.tax = String(totals.tax);
    next.total = String(totals.total);
    if (content.paymentTerms) next.paymentTerms = content.paymentTerms;
    if (content.supportTerms) next.supportTerms = content.supportTerms;
    if (content.expiryDays) next.expiryDays = content.expiryDays;
  }

  // Save previous version (snapshot) then bump
  const prevVersion = current.version || 1;
  await db.insert(proposalVersions).values({
    proposalId: id,
    version: prevVersion,
    title: current.title,
    content: current.proposalContent as any,
    summary: current.summary,
    total: current.total,
    status: current.status,
    changeNote: `Snapshot before v${prevVersion + 1}`,
  });

  const newVersion = prevVersion + 1;
  next.version = newVersion;

  await db.update(proposals).set(next).where(eq(proposals.id, id));
  await db.insert(proposalVersions).values({
    proposalId: id,
    version: newVersion,
    title: (patch.title as string) || current.title,
    content: content as any,
    summary: (patch.summary as string) || current.summary,
    total: String((content && computeTotals(content).total) ?? current.total),
    status: (patch.status as string) || current.status,
    changeNote,
  });

  // Sync items + milestones when content changes
  if (patch.content && content) {
    await pool.query(`DELETE FROM proposal_items WHERE proposal_id = $1`, [id]);
    await pool.query(`DELETE FROM proposal_payment_milestones WHERE proposal_id = $1`, [id]);
    for (const [i, svc] of content.services.entries()) {
      await db.insert(proposalItems).values({
        proposalId: id, sortOrder: i, name: svc.name, description: svc.description || null,
        serviceType: svc.id || null, implementationFee: String(svc.implementationFee ?? 0),
        monthlyRecurring: String(svc.monthlyRecurring ?? 0), quantity: svc.quantity ?? 1, isAddon: !!svc.isAddon,
      });
    }
    for (const m of content.milestones) {
      await db.insert(proposalPaymentMilestones).values({
        proposalId: id, label: m.label, percent: m.percent, amount: String(m.amount), status: "pending",
      });
    }
  }

  await recordEvent(id, "edited", { note: changeNote });
  return true;
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------
export async function duplicateProposal(id: number): Promise<number | null> {
  await ensureProposalTables();
  const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (rows.length === 0) return null;
  const p = rows[0];
  const newId = await createProposal({
    title: `${p.title} (Copy)`,
    clientName: p.clientName || undefined,
    companyName: p.companyName || undefined,
    clientEmail: p.clientEmail || undefined,
    clientPhone: p.clientPhone || undefined,
    clientWebsite: p.clientWebsite || undefined,
    industry: p.industry || undefined,
    leadId: p.leadId || undefined,
    clientId: p.clientId || undefined,
    projectDescription: p.projectDescription || undefined,
    businessProblems: p.businessProblems || undefined,
    goals: p.goals || undefined,
    requirements: p.requirements || undefined,
    summary: p.summary || undefined,
    content: (p.proposalContent as unknown as ProposalContent) || undefined,
    paymentTerms: p.paymentTerms || undefined,
    supportTerms: p.supportTerms || undefined,
    expiryDays: p.expiryDays || 14,
    notes: p.notes || undefined,
  });
  await recordEvent(newId, "duplicated", { sourceProposalId: id });
  return newId;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
export async function setProposalStatus(
  id: number,
  status: ProposalStatus,
  meta: { by?: string; ip?: string; userAgent?: string } = {}
): Promise<void> {
  await ensureProposalTables();
  const next: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  };
  const now = new Date();
  switch (status) {
    case "sent":
      next.sentAt = now;
      next.expiresAt = expiryDate(undefined, now);
      break;
    case "viewed":
      next.viewedAt = next.viewedAt ? undefined : now; // first view only
      next.totalViewed = sql`coalesce(${proposals.totalViewed}, 0) + 1`;
      break;
    case "accepted":
      next.acceptedAt = now;
      break;
    case "rejected":
      next.rejectedAt = now;
      break;
    case "changes_requested":
      next.changesRequestedAt = now;
      break;
    case "archived":
      next.archivedAt = now;
      break;
    case "approved":
      break;
  }
  delete next.viewedAt; // handled below
  if (status === "viewed") {
    await db
      .update(proposals)
      .set({ totalViewed: sql`coalesce(${proposals.totalViewed}, 0) + 1`, lastActivityAt: now, updatedAt: now })
      .where(eq(proposals.id, id));
    const existing = await db.select({ viewedAt: proposals.viewedAt }).from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!existing[0]?.viewedAt) {
      await db.update(proposals).set({ viewedAt: now, status: "viewed" }).where(eq(proposals.id, id));
    }
    await recordEvent(id, "viewed", { by: meta.by });
    return;
  }
  await db.update(proposals).set(next).where(eq(proposals.id, id));
  await recordEvent(id, status as ProposalEventType, { by: meta.by, ip: meta.ip });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export async function recordEvent(
  proposalId: number,
  eventType: ProposalEventType | string,
  metadata: Record<string, unknown> = {},
  meta: { ip?: string; userAgent?: string } = {}
): Promise<void> {
  try {
    await ensureProposalTables();
    await db.insert(proposalEvents).values({
      proposalId,
      eventType: eventType as any,
      metadata,
      ipAddress: meta.ip || null,
      userAgent: meta.userAgent || null,
    });
    await db
      .update(proposals)
      .set({ lastActivityAt: new Date() })
      .where(eq(proposals.id, proposalId));
  } catch (e) {
    console.error("recordEvent error:", e);
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
export async function addComment(
  proposalId: number,
  content: string,
  opts: { author?: string; authorType?: "client" | "team"; ip?: string } = {}
): Promise<void> {
  await ensureProposalTables();
  await db.insert(proposalComments).values({
    proposalId,
    author: opts.author || null,
    authorType: opts.authorType || "team",
    content,
  });
  await recordEvent(proposalId, "changes_requested", { comment: content.slice(0, 200), ip: opts.ip });
}

// ---------------------------------------------------------------------------
// Acceptance / rejection (client side)
// ---------------------------------------------------------------------------
export interface ClientDecisionInput {
  proposalId: number;
  decision: "accepted" | "rejected" | "changes_requested";
  clientName?: string;
  clientEmail?: string;
  comments?: string;
  ip?: string;
  userAgent?: string;
}

export async function recordClientDecision(input: ClientDecisionInput): Promise<void> {
  await ensureProposalTables();
  const rows = await db.select().from(proposals).where(eq(proposals.id, input.proposalId)).limit(1);
  if (rows.length === 0) return;
  const p = rows[0];

  await db.insert(proposalAcceptance).values({
    proposalId: input.proposalId,
    version: p.version || 1,
    decision: input.decision,
    clientName: input.clientName || p.clientName,
    clientEmail: input.clientEmail || p.clientEmail,
    comments: input.comments || null,
    ipAddress: input.ip || null,
    userAgent: input.userAgent || null,
  });

  if (input.decision === "accepted") {
    await setProposalStatus(input.proposalId, "accepted");
    await db
      .update(proposals)
      .set({
        signedBy: input.clientName || p.clientName,
        signedAt: new Date(),
        signatureUrl: input.comments ? `accepted:${input.comments}` : "accepted",
      })
      .where(eq(proposals.id, input.proposalId));
    // Create an invoice draft (reuse existing invoices + clients tables).
    // invoices.client_id is NOT NULL, so ensure a client row exists first.
    try {
      const total = Number(p.total || 0);
      let clientId = p.clientId;
      if (!clientId) {
        const clientRes = await pool.query(
          `INSERT INTO clients (company_name, primary_contact_name, primary_contact_email, industry, status)
           VALUES ($1, $2, $3, $4, 'active')
           RETURNING id`,
          [p.companyName || p.clientName || "New Client", p.clientName || "New Client", p.clientEmail || "client@unknown.local", p.industry]
        );
        clientId = clientRes.rows[0].id;
        await db.update(proposals).set({ clientId }).where(eq(proposals.id, input.proposalId));
      }
      await pool.query(
        `INSERT INTO invoices (number, client_id, issue_date, due_date, status, subtotal, total, amount_due)
         VALUES ($1, $2, now(), now() + interval '14 days', 'draft', $3, $4, $4)`,
        [`INV-${String(input.proposalId).padStart(4, "0")}`, clientId, total, total]
      );
    } catch (e) {
      console.warn("Invoice draft creation failed:", e);
    }
  } else if (input.decision === "rejected") {
    await setProposalStatus(input.proposalId, "rejected");
  } else {
    await setProposalStatus(input.proposalId, "changes_requested");
  }

  await recordEvent(input.proposalId, input.decision as ProposalEventType, {
    clientName: input.clientName, comments: input.comments?.slice(0, 300), ip: input.ip,
  });
}

// ---------------------------------------------------------------------------
// Expiry sweep
// ---------------------------------------------------------------------------
export async function expireOverdueProposals(): Promise<number> {
  await ensureProposalTables();
  const res = await pool.query(
    `UPDATE proposals SET status = 'expired', updated_at = now()
     WHERE status IN ('sent', 'viewed') AND expires_at IS NOT NULL AND expires_at < now()
     RETURNING id`
  );
  const ids: number[] = (res.rows as any[]).map((r) => r.id);
  for (const id of ids) await recordEvent(id, "expired");
  return ids.length;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteProposal(id: number): Promise<void> {
  await ensureProposalTables();
  await pool.query(`DELETE FROM proposal_versions WHERE proposal_id = $1`, [id]);
  await pool.query(`DELETE FROM proposal_items WHERE proposal_id = $1`, [id]);
  await pool.query(`DELETE FROM proposal_events WHERE proposal_id = $1`, [id]);
  await pool.query(`DELETE FROM proposal_comments WHERE proposal_id = $1`, [id]);
  await pool.query(`DELETE FROM proposal_acceptance WHERE proposal_id = $1`, [id]);
  await pool.query(`DELETE FROM proposal_payment_milestones WHERE proposal_id = $1`, [id]);
  await db.delete(proposals).where(eq(proposals.id, id));
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function listProposals(opts: {
  search?: string; status?: string; limit?: number; offset?: number; includeArchived?: boolean;
} = {}) {
  await ensureProposalTables();
  const limit = Math.min(opts.limit || 50, 200);
  const offset = opts.offset || 0;
  const filters: any[] = [];
  if (opts.search) {
    filters.push(
      or(
        sql`${proposals.title} ILIKE ${"%" + opts.search + "%"}`,
        sql`${proposals.clientName} ILIKE ${"%" + opts.search + "%"}`,
        sql`${proposals.companyName} ILIKE ${"%" + opts.search + "%"}`
      )
    );
  }
  if (opts.status) filters.push(eq(proposals.status, opts.status as any));
  if (!opts.includeArchived) filters.push(sql`${proposals.archivedAt} IS NULL`);
  const where = filters.length ? and(...filters) : undefined;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: proposals.id, title: proposals.title, number: proposals.number, status: proposals.status,
        clientName: proposals.clientName, companyName: proposals.companyName, clientEmail: proposals.clientEmail,
        industry: proposals.industry, total: proposals.total, currency: proposals.currency,
        generatedByAi: proposals.generatedByAi, aiStatus: proposals.aiStatus,
        sentAt: proposals.sentAt, viewedAt: proposals.viewedAt, acceptedAt: proposals.acceptedAt,
        rejectedAt: proposals.rejectedAt, expiresAt: proposals.expiresAt,
        lastActivityAt: proposals.lastActivityAt, totalViewed: proposals.totalViewed,
        createdAt: proposals.createdAt, updatedAt: proposals.updatedAt, leadId: proposals.leadId,
      })
      .from(proposals)
      .where(where)
      .orderBy(desc(sql`coalesce(${proposals.lastActivityAt}, ${proposals.updatedAt})`))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(proposals).where(where).then((r) => Number(r[0]?.n ?? 0)),
  ]);

  return { proposals: rows, total };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export async function getProposalAnalytics(): Promise<ProposalAnalytics> {
  await ensureProposalTables();
  const rows = await db.select().from(proposals).where(sql`${proposals.archivedAt} IS NULL`);
  const byStatus: Record<string, number> = {};
  for (const p of rows) byStatus[p.status || "draft"] = (byStatus[p.status || "draft"] || 0) + 1;

  const totalValue = rows.reduce((s, p) => s + Number(p.total || 0), 0);
  const accepted = rows.filter((p) => p.status === "accepted");
  const rejected = rows.filter((p) => p.status === "rejected");
  const sent = rows.filter((p) => p.status === "sent" || p.status === "viewed" || p.status === "accepted");
  const viewed = rows.filter((p) => p.status === "viewed" || p.status === "accepted");
  const sentOrLater = rows.filter((p) => p.status && ["sent", "viewed", "accepted", "rejected"].includes(p.status));

  const acceptedRevenue = accepted.reduce((s, p) => s + Number(p.total || 0), 0);
  const conversionRate = sentOrLater.length ? (accepted.length / sentOrLater.length) * 100 : 0;
  const viewRate = sent.length ? (viewed.length / sent.length) * 100 : 0;

  const acceptDeltas = accepted
    .filter((p) => p.sentAt && p.acceptedAt)
    .map((p) => Math.round((new Date(p.acceptedAt!).getTime() - new Date(p.sentAt!).getTime()) / 86_400_000));
  const avgDaysToAccept = acceptDeltas.length ? acceptDeltas.reduce((a, b) => a + b, 0) / acceptDeltas.length : 0;

  return {
    total: rows.length,
    byStatus,
    totalValue,
    conversionRate: Math.round(conversionRate * 10) / 10,
    averageValue: rows.length ? Math.round(totalValue / rows.length) : 0,
    avgDaysToAccept: Math.round(avgDaysToAccept * 10) / 10,
    viewRate: Math.round(viewRate * 10) / 10,
    acceptedRevenue,
    drafts: byStatus["draft"] || 0,
    sent: byStatus["sent"] || 0,
    viewed: byStatus["viewed"] || 0,
    accepted: accepted.length,
    rejected: rejected.length,
    expired: byStatus["expired"] || 0,
  };
}

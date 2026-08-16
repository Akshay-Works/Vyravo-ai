// Portal Engine — business logic with strict client isolation.
// EVERY query is scoped to the authenticated client's client_id.

import { eq, and, desc, sql, or, ilike, count } from "drizzle-orm";
import { pool, db } from "@/db";
import {
  clientUsers,
  clientFiles,
  clientMessages,
  clientNotifications,
  onboardingTasks,
} from "@/db/portal-schema";
import { clients, projects, invoices, tasks, activities, meetings } from "@/db/schema";
import { proposals } from "@/db/proposal-schema";

// ---------------------------------------------------------------------------
// Lazy schema bootstrap
// ---------------------------------------------------------------------------
let ensured: Promise<void> | null = null;

export function ensurePortalTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const [name, ddl] of [
        ["client_users", `(
          id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL, phone TEXT, job_title TEXT, timezone VARCHAR(50) DEFAULT 'UTC',
          role VARCHAR(30) DEFAULT 'owner' NOT NULL, password_hash TEXT,
          is_active BOOLEAN DEFAULT true, email_verified_at TIMESTAMP,
          last_login_at TIMESTAMP, invited_by INTEGER,
          created_at TIMESTAMP DEFAULT now() NOT NULL,
          updated_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["client_sessions", `(
          id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
          expires_at TIMESTAMP NOT NULL, ip TEXT, user_agent TEXT,
          created_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["client_files", `(
          id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER,
          uploaded_by INTEGER, name TEXT NOT NULL, original_name TEXT, mime_type TEXT,
          size_bytes INTEGER, storage_path TEXT, category VARCHAR(50) DEFAULT 'general',
          access_level VARCHAR(30) DEFAULT 'client', description TEXT, version INTEGER DEFAULT 1,
          is_archived BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["client_messages", `(
          id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER,
          ticket_id INTEGER, sender_type VARCHAR(20) NOT NULL, sender_name TEXT,
          sender_user_id INTEGER, content TEXT NOT NULL, has_attachments BOOLEAN DEFAULT false,
          is_read BOOLEAN DEFAULT false, read_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["message_attachments", `(
          id SERIAL PRIMARY KEY, message_id INTEGER NOT NULL, file_name TEXT, file_type TEXT,
          file_size INTEGER, file_url TEXT, created_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["client_notifications", `(
          id SERIAL PRIMARY KEY, client_user_id INTEGER NOT NULL, type VARCHAR(50) NOT NULL,
          title TEXT NOT NULL, body TEXT, link TEXT, is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP, created_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
        ["onboarding_tasks", `(
          id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER,
          title TEXT NOT NULL, description TEXT, category VARCHAR(50),
          status VARCHAR(30) DEFAULT 'pending', sort_order INTEGER DEFAULT 0,
          completed_at TIMESTAMP, created_at TIMESTAMP DEFAULT now() NOT NULL,
          updated_at TIMESTAMP DEFAULT now() NOT NULL
        )`],
      ]) {
        await pool.query(`CREATE TABLE IF NOT EXISTS ${name} ${ddl}`);
      }
    })().catch((e) => console.error("ensurePortalTables failed:", e));
  }
  return ensured;
}

// ---------------------------------------------------------------------------
// Client registration (after proposal acceptance)
// ---------------------------------------------------------------------------
export async function registerClient(
  clientName: string,
  companyName: string,
  email: string,
  passwordHash: string,
  inviterId?: number
): Promise<{ clientUserId: number; clientId: number }> {
  await ensurePortalTables();
  // Create client row if not exists
  const existingClient = await pool.query(
    `SELECT id FROM clients WHERE primary_contact_email = $1 LIMIT 1`,
    [email]
  );
  let clientId: number;
  if ((existingClient.rowCount ?? 0) > 0) {
    clientId = Number(existingClient.rows[0].id);
  } else {
    const c = await pool.query(
      `INSERT INTO clients (company_name, primary_contact_name, primary_contact_email, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [companyName || clientName, clientName, email]
    );
    clientId = Number(c.rows[0].id);
  }

  const user = await pool.query(
    `INSERT INTO client_users (client_id, email, name, password_hash, role, invited_by)
     VALUES ($1, $2, $3, $4, 'owner', $5)
     RETURNING id`,
    [clientId, email, clientName, passwordHash, inviterId || null]
  );
  const clientUserId = Number(user.rows[0].id);

  await logActivity(clientId, "client", "Client registered", `Client ${clientName} registered and portal activated.`);

  return { clientUserId, clientId };
}

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------
export async function getDashboard(clientId: number) {
  await ensurePortalTables();
  const [client, proj, inv, prop, messages, visits] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, clientId)).limit(1),
    db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt)),
    db.select({ id: invoices.id, number: invoices.number, total: invoices.total, status: invoices.status, dueDate: invoices.dueDate, createdAt: invoices.createdAt })
      .from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt)),
    db.select({ id: proposals.id, title: proposals.title, status: proposals.status, total: proposals.total, createdAt: proposals.createdAt })
      .from(proposals).where(eq(proposals.clientId, clientId)).orderBy(desc(proposals.createdAt)),
    db.select({ n: count() }).from(clientMessages).where(and(eq(clientMessages.clientId, clientId), eq(clientMessages.senderType, "team"), eq(clientMessages.isRead, false)))
      .then((r) => Number(r[0]?.n ?? 0)),
    // Upcoming meetings
    db.select().from(meetings).where(and(eq(meetings.clientId, clientId), eq(meetings.status, "scheduled"))).orderBy(desc(meetings.scheduledAt)).limit(1),
  ]);

  const activeProject = proj.find((p) => !["completed", "cancelled"].includes(p.status || ""));

  return {
    client: client[0] || null,
    activeProject,
    projects: proj,
    invoices: inv,
    proposals: prop,
    unreadMessages: messages,
    upcomingMeeting: visits[0] || null,
    projectCount: proj.length,
    invoiceDue: inv.filter((i) => i.status === "sent" || i.status === "pending"),
  };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export async function getClientProjects(clientId: number) {
  await ensurePortalTables();
  return db
    .select()
    .from(projects)
    .where(eq(projects.clientId, clientId))
    .orderBy(desc(projects.updatedAt));
}

export async function getClientProject(clientId: number, projectId: number) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId)))
    .limit(1)
    .then((r) => r[0] || null);
}

// ---------------------------------------------------------------------------
// Proposals (reuse existing proposal system, scope by clientId)
// ---------------------------------------------------------------------------
export async function getClientProposals(clientId: number) {
  await ensurePortalTables();
  return db
    .select({
      id: proposals.id, title: proposals.title, number: proposals.number,
      status: proposals.status, total: proposals.total, currency: proposals.currency,
      summary: proposals.summary, expiresAt: proposals.expiresAt,
      viewedAt: proposals.viewedAt, acceptedAt: proposals.acceptedAt,
      sentAt: proposals.sentAt, signedBy: proposals.signedBy,
      proposalContent: proposals.proposalContent, secureToken: proposals.secureToken,
      createdAt: proposals.createdAt, updatedAt: proposals.updatedAt,
    })
    .from(proposals)
    .where(eq(proposals.clientId, clientId))
    .orderBy(desc(proposals.updatedAt));
}

// ---------------------------------------------------------------------------
// Invoices (reuse existing invoices table)
// ---------------------------------------------------------------------------
export async function getClientInvoices(clientId: number) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.clientId, clientId))
    .orderBy(desc(invoices.createdAt));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export async function getClientMessages(clientId: number, projectId?: number) {
  await ensurePortalTables();
  const filters: any[] = [eq(clientMessages.clientId, clientId)];
  if (projectId) filters.push(eq(clientMessages.projectId, projectId));
  return db
    .select()
    .from(clientMessages)
    .where(and(...filters))
    .orderBy(desc(clientMessages.createdAt));
}

export async function sendMessage(
  clientId: number,
  content: string,
  opts: { projectId?: number; ticketId?: number; senderName?: string; senderUserId?: number } = {}
) {
  await ensurePortalTables();
  const msg = await db
    .insert(clientMessages)
    .values({
      clientId,
      projectId: opts.projectId || null,
      ticketId: opts.ticketId || null,
      senderType: "client",
      senderName: opts.senderName || "Client",
      senderUserId: opts.senderUserId || null,
      content,
    })
    .returning({ id: clientMessages.id });
  await logActivity(clientId, "message", "Message sent", `Client sent a message: ${content.slice(0, 80)}`);
  return msg[0];
}

export async function markMessagesRead(clientId: number, projectId?: number) {
  const filters = ["sender_type = 'team'", "client_id = $1"];
  const params: unknown[] = [clientId];
  if (projectId) {
    filters.push("project_id = $2");
    params.push(projectId);
  }
  await pool.query(
    `UPDATE client_messages SET is_read = true, read_at = now()
     WHERE ${filters.join(" AND ")} AND is_read = false`,
    params
  );
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
export async function getClientFiles(clientId: number, projectId?: number) {
  await ensurePortalTables();
  const filters: any[] = [eq(clientFiles.clientId, clientId), eq(clientFiles.isArchived, false)];
  if (projectId) filters.push(eq(clientFiles.projectId, projectId));
  return db
    .select()
    .from(clientFiles)
    .where(and(...filters))
    .orderBy(desc(clientFiles.createdAt));
}

export async function uploadFile(
  clientId: number,
  data: {
    name: string; originalName: string; mimeType: string; sizeBytes: number;
    storagePath: string; category?: string; projectId?: number; uploadedBy?: number;
  }
) {
  await ensurePortalTables();
  const f = await db
    .insert(clientFiles)
    .values({
      clientId,
      projectId: data.projectId || null,
      uploadedBy: data.uploadedBy || null,
      name: data.name,
      originalName: data.originalName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storagePath: data.storagePath,
      category: data.category || "general",
      accessLevel: "client",
    })
    .returning({ id: clientFiles.id });
  await logActivity(clientId, "file", "File uploaded", `${data.originalName} uploaded`);
  return f[0];
}

// ---------------------------------------------------------------------------
// Support tickets (reuse tasks table — has clientId, projectId, title, desc, status, priority)
// ---------------------------------------------------------------------------
export async function getClientTickets(clientId: number) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId))
    .orderBy(desc(tasks.createdAt));
}

export async function createTicket(data: {
  clientId: number; title: string; description: string; priority?: string; projectId?: number;
}) {
  const t = await db
    .insert(tasks)
    .values({
      clientId: data.clientId,
      projectId: data.projectId || null,
      title: data.title,
      description: data.description,
      status: "open",
      priority: (data.priority as any) || "medium",
    })
    .returning({ id: tasks.id });
  await logActivity(data.clientId, "ticket", "Support ticket created", `Ticket #${t[0].id}: ${data.title}`);
  return t[0];
}

// ---------------------------------------------------------------------------
// Activity log (reuse activities table)
// ---------------------------------------------------------------------------
export async function getClientActivity(clientId: number, limit = 50) {
  return db
    .select()
    .from(activities)
    .where(eq(activities.clientId, clientId))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}

export async function logActivity(
  clientId: number,
  type: string,
  action: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.insert(activities).values({
      clientId,
      type: type as any,
      action,
      description: description || action,
      metadata: metadata as any,
    });
  } catch (e) {
    console.error("logActivity error:", e);
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function getClientNotifications(clientUserId: number) {
  await ensurePortalTables();
  return db
    .select()
    .from(clientNotifications)
    .where(eq(clientNotifications.clientUserId, clientUserId))
    .orderBy(desc(clientNotifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: number) {
  await db
    .update(clientNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(clientNotifications.id, id));
}

export async function createNotification(
  clientUserId: number,
  type: string,
  title: string,
  body?: string,
  link?: string
) {
  await ensurePortalTables();
  await db.insert(clientNotifications).values({ clientUserId, type, title, body, link });
}

// ---------------------------------------------------------------------------
// Onboarding tasks
// ---------------------------------------------------------------------------
export async function getOnboardingTasks(clientId: number) {
  await ensurePortalTables();
  return db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.clientId, clientId))
    .orderBy(onboardingTasks.sortOrder);
}

export async function completeOnboardingTask(taskId: number) {
  await db
    .update(onboardingTasks)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(onboardingTasks.id, taskId));
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfile(
  userId: number,
  data: { name?: string; phone?: string; timezone?: string; jobTitle?: string }
) {
  await db.update(clientUsers).set({ ...data, updatedAt: new Date() }).where(eq(clientUsers.id, userId));
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { eq, desc, and } from "drizzle-orm";
import { db, pool } from "@/db";
import { clients, leads, projects, invoices, meetings, activities, tasks } from "@/db/schema";
import { proposals } from "@/db/proposal-schema";
import { clientUsers, clientFiles, clientMessages } from "@/db/portal-schema";
import { workflowExecutions } from "@/db/workflow-schema";

export const dynamic = "force-dynamic";

// GET /api/admin/clients/[id]/360 — unified client record
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const cid = Number(id);

    // All data for this client, scoped strictly by client_id
    const [client, lead, projs, props, invs, meetingsList, users, files, messages, tickets, activity, workflows] = await Promise.all([
      db.select().from(clients).where(eq(clients.id, cid)).limit(1).then((r) => r[0] || null),
      db.select().from(leads).where(eq(leads.id, (await db.select({ convertedFromLeadId: clients.convertedFromLeadId }).from(clients).where(eq(clients.id, cid)).limit(1).then((r) => r[0]?.convertedFromLeadId || 0)))).limit(1).then((r) => r[0] || null),
      db.select().from(projects).where(eq(projects.clientId, cid)).orderBy(desc(projects.updatedAt)).limit(50),
      db.select({ id: proposals.id, title: proposals.title, number: proposals.number, status: proposals.status, total: proposals.total, currency: proposals.currency, sentAt: proposals.sentAt, viewedAt: proposals.viewedAt, acceptedAt: proposals.acceptedAt, createdAt: proposals.createdAt })
        .from(proposals).where(eq(proposals.clientId, cid)).orderBy(desc(proposals.createdAt)),
      db.select().from(invoices).where(eq(invoices.clientId, cid)).orderBy(desc(invoices.createdAt)),
      db.select().from(meetings).where(eq(meetings.clientId, cid)).orderBy(desc(meetings.scheduledAt)),
      db.select({ id: clientUsers.id, name: clientUsers.name, email: clientUsers.email, role: clientUsers.role, isActive: clientUsers.isActive, lastLoginAt: clientUsers.lastLoginAt }).from(clientUsers).where(eq(clientUsers.clientId, cid)),
      db.select().from(clientFiles).where(eq(clientFiles.clientId, cid)).orderBy(desc(clientFiles.createdAt)).limit(50),
      db.select().from(clientMessages).where(eq(clientMessages.clientId, cid)).orderBy(desc(clientMessages.createdAt)).limit(50),
      db.select({ id: tasks.id, title: tasks.title, description: tasks.description, status: tasks.status, priority: tasks.priority, createdAt: tasks.createdAt }).from(tasks).where(eq(tasks.clientId, cid)).orderBy(desc(tasks.createdAt)).limit(50),
      db.select({ id: activities.id, type: activities.type, action: activities.action, description: activities.description, createdAt: activities.createdAt }).from(activities).where(eq(activities.clientId, cid)).orderBy(desc(activities.createdAt)).limit(50),
      db.select().from(workflowExecutions).where(eq(workflowExecutions.clientId, cid)).orderBy(desc(workflowExecutions.createdAt)).limit(50),
    ]);

    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

    // Build a simple timeline
    const timeline = [
      ...(lead ? [{ type: "lead", action: "Lead created", date: lead.createdAt, data: { stage: lead.stage, source: lead.source } }] : []),
      ...props.map((p) => ({ type: "proposal", action: `Proposal: ${p.title}`, date: p.createdAt, data: { status: p.status, total: p.total } })),
      ...invs.map((i) => ({ type: "invoice", action: `Invoice ${i.number}`, date: i.createdAt, data: { status: i.status, total: i.total } })),
      ...activity.map((a) => ({ type: a.type, action: a.action, date: a.createdAt, data: { description: a.description } })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30);

    return Response.json({
      client,
      lead,
      projects: projs,
      proposals: props,
      invoices: invs,
      meetings: meetingsList,
      portalUsers: users,
      files,
      messages,
      supportTickets: tickets,
      activity,
      workflows,
      timeline,
    });
  } catch (e) {
    console.error("Client 360 error:", e);
    return Response.json({ error: "Failed to load client data" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { clients, projects, invoices } from "@/db/schema";
import { proposals } from "@/db/proposal-schema";
import { clientUsers, clientFiles, clientMessages } from "@/db/portal-schema";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/portal/admin/clients/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const cid = Number(id);
    const [client, projs, invs, props, users, files] = await Promise.all([
      db.select().from(clients).where(eq(clients.id, cid)).limit(1).then((r) => r[0] || null),
      db.select().from(projects).where(eq(projects.clientId, cid)).orderBy(desc(projects.createdAt)),
      db.select().from(invoices).where(eq(invoices.clientId, cid)).orderBy(desc(invoices.createdAt)),
      db.select({ id: proposals.id, title: proposals.title, status: proposals.status, total: proposals.total, createdAt: proposals.createdAt })
        .from(proposals).where(eq(proposals.clientId, cid)).orderBy(desc(proposals.createdAt)),
      db.select().from(clientUsers).where(eq(clientUsers.clientId, cid)),
      db.select().from(clientFiles).where(eq(clientFiles.clientId, cid)).orderBy(desc(clientFiles.createdAt)),
    ]);
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
    return Response.json({ client, projects: projs, invoices: invs, proposals: props, users, files, unreadMessages: 0 });
  } catch (e) {
    console.error("Admin client detail error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

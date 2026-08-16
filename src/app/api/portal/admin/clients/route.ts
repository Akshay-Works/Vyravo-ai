import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { eq, desc, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";

export const dynamic = "force-dynamic";

// GET /api/portal/admin/clients
export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [rows, total] = await Promise.all([
      db.select().from(clients).orderBy(desc(clients.createdAt)).limit(200),
      db.select({ n: count() }).from(clients).then((r) => Number(r[0]?.n ?? 0)),
    ]);
    return Response.json({ clients: rows, total });
  } catch (e) {
    console.error("Admin list clients error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

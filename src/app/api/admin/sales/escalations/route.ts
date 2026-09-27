import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/admin/sales/escalations?status=open — founder action feed.
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const where = status === "all" ? "" : "WHERE e.status = $1";
  const args: any[] = status === "all" ? [] : [status];
  const r = await pool.query(
    `SELECT e.*, l.business_name, l.email AS lead_email, l.lead_score, l.stage
     FROM sales_escalations e LEFT JOIN leads l ON l.id = e.lead_id
     ${where} ORDER BY e.created_at DESC LIMIT $${args.length + 1}`, [...args, limit]);
  const counts = await pool.query(`SELECT status, count(*)::int n FROM sales_escalations GROUP BY 1`);
  return Response.json({ ok: true, escalations: r.rows, counts: counts.rows });
}

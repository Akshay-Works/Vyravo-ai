import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { logDecision } from "@/lib/sales/schema";

export const dynamic = "force-dynamic";

// POST /api/admin/sales/escalations/action — { id, action: ack|resolve|reopen }
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const id = Number(b.id);
  const action = String(b.action || "");
  if (!id || !["ack", "resolve", "reopen"].includes(action))
    return Response.json({ error: "id + action (ack|resolve|reopen) required" }, { status: 400 });
  const to = action === "ack" ? "acked" : action === "resolve" ? "resolved" : "open";
  const r = await pool.query(
    `UPDATE sales_escalations SET status = $2, resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
       resolved_by = CASE WHEN $2 IN ('acked','resolved') THEN 'admin' ELSE resolved_by END
     WHERE id = $1 RETURNING lead_id, kind`, [id, to]);
  if ((r.rowCount ?? 0) === 0) return Response.json({ error: "not found" }, { status: 404 });
  await logDecision({ lead_id: r.rows[0].lead_id, trigger_text: `escalation:${action}`,
    action: `escalation_${action}`, autonomy: "none", reason: `${r.rows[0].kind} #${id} → ${to} by admin`, result: to });
  return Response.json({ ok: true, status: to });
}

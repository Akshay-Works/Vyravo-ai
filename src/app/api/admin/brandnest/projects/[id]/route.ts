import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { updateProject } from "@/lib/brandnest/projects";

export const dynamic = "force-dynamic";

// PATCH /api/admin/brandnest/projects/[id] — update status/amount/dates.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await request.json().catch(() => ({}));
    await updateProject(Number(id), {
      status: b.status, amount: b.amount ?? undefined, deliveryDate: b.deliveryDate,
      paymentDate: b.paymentDate, paymentMethod: b.paymentMethod, notes: b.notes, service: b.service,
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

// DELETE — ledger correction. Logged; revenue aggregates recompute live.
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { pool } = await import("@/db");
  const cur = (await pool.query(`SELECT * FROM brandnest_projects WHERE id = $1`, [Number(id)])).rows[0];
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });
  await pool.query(`DELETE FROM brandnest_projects WHERE id = $1`, [Number(id)]);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at) VALUES ('lead','brandnest_project_deleted',$2,$1,now())`,
    [cur.lead_id, `[BRANDNEST] Project #${id} deleted by admin (${cur.service} — ${cur.currency} ${cur.amount})`]).catch(() => {});
  const { logDecision } = await import("@/lib/sales/schema");
  await logDecision({ lead_id: cur.lead_id, trigger_text: "brandnest", action: "brandnest_project_deleted",
    autonomy: "none", reason: `project #${id} deleted (${cur.service} ${cur.amount})`, result: "deleted" });
  return Response.json({ ok: true });
}

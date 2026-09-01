import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

type Body = { status?: string; notes?: string; follow_up_date?: string | null };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return Response.json({ error: "Bad id" }, { status: 400 });
  const body: Body = await request.json().catch(() => ({}));

  const sets: string[] = [];
  const vals: any[] = [];
  const add = (sql: string, v: any) => { vals.push(v); sets.push(sql.replace("?", `$${vals.length}`)); };
  const allowedStatus = ["NEW", "QUALIFIED", "CONTACTED", "REPLIED", "INTERESTED", "CALL_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "DO_NOT_CONTACT"];
  if (body.status) {
    if (!allowedStatus.includes(body.status)) return Response.json({ error: "Bad status" }, { status: 400 });
    add("status = ?", body.status);
    if (body.status === "CONTACTED") sets.push(`last_contacted_at = now()`);
    // DO_NOT_CONTACT is honored by the funnel (never re-queued); noted in logs
  }
  if (typeof body.notes === "string") add("notes = ?", body.notes.slice(0, 5000));
  if ("follow_up_date" in body) add("follow_up_date = ?", body.follow_up_date);
  if (!sets.length) return Response.json({ error: "Nothing to update" }, { status: 400 });
  vals.push(numId);
  const r = await pool.query(`UPDATE funnel2_leads SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length} RETURNING *`, vals);
  if (!r.rowCount) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ lead: r.rows[0] });
}

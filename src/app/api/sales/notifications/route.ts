import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const r = await pool.query(
    `SELECT * FROM notifications
     WHERE (user_id = $1 OR (user_id IS NULL AND role_target IN ('all', $2)))
     ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 30`,
    [auth.user.id, auth.user.role]);
  return Response.json({ ok: true, notifications: r.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const b = await request.json().catch(() => ({}));
  if (b.all) {
    await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [auth.user.id]);
  } else if (Number(b.id)) {
    await pool.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`, [Number(b.id), auth.user.id]);
  }
  return Response.json({ ok: true });
}

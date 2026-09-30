import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import {
  ensureRbacSchema, getCurrentUser, createEmployee, setEmployeeStatus,
  setEmployeeRole, listEmployees, assignLeads, audit,
} from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

async function gate() {
  await ensureRbacSchema();
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(request: NextRequest) {
  const g = await gate();
  if (g) return g;
  const u = new URL(request.url);
  const tab = u.searchParams.get("tab") || "team";
  const [employees, activity, approvals] = await Promise.all([
    listEmployees(),
    tab === "activity"
      ? pool.query(`SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN kb_users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`).then((r) => r.rows)
      : Promise.resolve([]),
    tab === "approvals"
      ? pool.query(`SELECT p.*, a.name AS author_name FROM content_posts p LEFT JOIN kb_users a ON a.id = p.author_id WHERE p.status IN ('pending_approval','review') ORDER BY p.updated_at DESC`).then((r) => r.rows)
      : Promise.resolve([]),
  ]);
  return Response.json({ ok: true, employees, activity, approvals });
}

// POST { action: create|status|role|assign, ... }
export async function POST(request: NextRequest) {
  const g = await gate();
  if (g) return g;
  const me = (await getCurrentUser())!;
  const b = await request.json().catch(() => ({}));
  try {
    switch (String(b.action)) {
      case "create": {
        const r = await createEmployee({ name: b.name, email: b.email, password: b.password, role: b.role });
        await audit({ userId: me.id, role: me.role, action: "admin.employee_created", object: "user", objectId: r.id, next: { email: b.email, role: b.role } });
        return Response.json({ ok: true, ...r });
      }
      case "status": {
        if (Number(b.id) === me.id && b.active === false) throw new Error("you cannot disable yourself");
        await setEmployeeStatus(Number(b.id), !!b.active);
        await audit({ userId: me.id, role: me.role, action: "admin.employee_status", object: "user", objectId: b.id, next: { active: !!b.active } });
        return Response.json({ ok: true });
      }
      case "role": {
        if (Number(b.id) === me.id) throw new Error("you cannot change your own role");
        await setEmployeeRole(Number(b.id), b.role);
        await audit({ userId: me.id, role: me.role, action: "admin.employee_role", object: "user", objectId: b.id, next: { role: b.role } });
        return Response.json({ ok: true });
      }
      case "assign":
        return Response.json({ ok: true, ...(await assignLeads(
          Array.isArray(b.leadIds) ? b.leadIds : [], b.userId == null ? null : Number(b.userId), me)) });
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

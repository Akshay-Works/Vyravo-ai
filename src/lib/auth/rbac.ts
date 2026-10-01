// ============================================================================
// RBAC — role-based access control for ONE Vyravo platform, three workspaces.
// Roles: admin (unrestricted superuser) | sales | social.
// Reuses kb_users (scrypt) + kb_sessions (opaque) + kb_session cookie.
// Legacy rows (workspace_role NULL) are FULL ADMINS — existing behavior
// preserved exactly; only explicitly-created employees are scoped.
// Enforcement is server-side: every API route + page checks role; employee
// queries are scoped in SQL (unauthorized rows never leave the database).
// ============================================================================
import { pool } from "@/db";
import { getAnySession } from "@/lib/knowledge-base/auth";
import { hashPassword } from "@/lib/portal/auth";
import { ensurePresenceSchema, touchPresence, endUserSessions } from "@/lib/auth/presence";

export type WorkspaceRole = "admin" | "sales" | "social";

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: WorkspaceRole;
}

export async function ensureRbacSchema(): Promise<void> {
  await pool.query(`ALTER TABLE kb_users ADD COLUMN IF NOT EXISTS workspace_role text`);
  await pool.query(`ALTER TABLE kb_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz`);
  await ensurePresenceSchema();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_calls (
      id serial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      user_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      outcome text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
      duration_secs integer, next_follow_up timestamptz, created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_calls_lead ON sales_calls(lead_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_calls_user ON sales_calls(user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_tasks (
      id serial PRIMARY KEY, lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      user_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      kind text NOT NULL DEFAULT 'followup', title text NOT NULL DEFAULT '',
      due_at timestamptz, status text NOT NULL DEFAULT 'open',
      notes text NOT NULL DEFAULT '', created_by integer,
      created_at timestamptz DEFAULT now(), done_at timestamptz
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_tasks_user ON sales_tasks(user_id, status)`);
  // One open task per lead+kind — accidental duplicate follow-ups are impossible.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tasks_open ON sales_tasks(lead_id, kind) WHERE status = 'open'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_posts (
      id serial PRIMARY KEY, platform text NOT NULL DEFAULT 'linkedin',
      content_type text NOT NULL DEFAULT 'post', caption text NOT NULL DEFAULT '',
      media_urls jsonb NOT NULL DEFAULT '[]', hashtags text NOT NULL DEFAULT '',
      scheduled_at timestamptz, status text NOT NULL DEFAULT 'draft',
      needs_approval boolean NOT NULL DEFAULT true,
      author_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      reviewer_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      review_note text NOT NULL DEFAULT '', metrics jsonb NOT NULL DEFAULT '{}',
      published_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_posts_status ON content_posts(status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_tasks (
      id serial PRIMARY KEY, title text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '', platform text NOT NULL DEFAULT '',
      due_at timestamptz, status text NOT NULL DEFAULT 'open',
      assignee_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      recurrence text NOT NULL DEFAULT '', created_by integer,
      created_at timestamptz DEFAULT now(), done_at timestamptz
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_tasks_assignee ON content_tasks(assignee_id, status)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_assets (
      id serial PRIMARY KEY, name text NOT NULL DEFAULT '',
      kind text NOT NULL DEFAULT 'info', body text NOT NULL DEFAULT '',
      created_by integer, created_at timestamptz DEFAULT now()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_metrics (
      id serial PRIMARY KEY, platform text NOT NULL DEFAULT '',
      date date NOT NULL DEFAULT CURRENT_DATE,
      followers integer NOT NULL DEFAULT 0, reach integer NOT NULL DEFAULT 0,
      engagement integer NOT NULL DEFAULT 0, posts integer NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(), UNIQUE (platform, date)
    )`);
  await pool.query(`ALTER TABLE social_metrics ADD COLUMN IF NOT EXISTS recorded_at timestamptz DEFAULT now()`);
  await pool.query(`ALTER TABLE social_metrics ADD COLUMN IF NOT EXISTS recorded_by integer`);
  await pool.query(`ALTER TABLE social_metrics ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT ''`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_metric_log (
      id serial PRIMARY KEY,
      platform text NOT NULL DEFAULT '',
      recorded_at timestamptz NOT NULL DEFAULT now(),
      recorded_by integer REFERENCES kb_users(id) ON DELETE SET NULL,
      followers integer, reach integer, engagement integer, posts integer,
      prev_followers integer, notes text NOT NULL DEFAULT ''
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_social_metric_log_plat ON social_metric_log(platform, recorded_at DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id serial PRIMARY KEY, user_id integer REFERENCES kb_users(id) ON DELETE CASCADE,
      role_target text NOT NULL DEFAULT 'all', title text NOT NULL DEFAULT '',
      body text NOT NULL DEFAULT '', link text NOT NULL DEFAULT '',
      read_at timestamptz, created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id serial PRIMARY KEY, user_id integer REFERENCES kb_users(id) ON DELETE SET NULL,
      role text NOT NULL DEFAULT '', action text NOT NULL DEFAULT '',
      object text NOT NULL DEFAULT '', object_id text NOT NULL DEFAULT '',
      prev jsonb NOT NULL DEFAULT '{}', new_data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_log(object, object_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`);
}

/** Resolve the current session to a workspace user (null = logged out). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const s = await getAnySession();
  if (!s || !s.userId) return null;
  try {
    const r = await pool.query(`SELECT id, email, name, workspace_role, is_active FROM kb_users WHERE id = $1`, [s.userId]);
    if ((r.rowCount ?? 0) === 0 || !r.rows[0].is_active) return null;
    const u = r.rows[0];
    const raw = String(u.workspace_role || "").toLowerCase();
    const role: WorkspaceRole = raw === "sales" || raw === "social" ? raw : "admin";
    if (s.sessionId) touchPresence(u.id, s.sessionId).catch(() => {});
    return { id: Number(u.id), email: u.email, name: u.name || u.email, role };
  } catch {
    return null;
  }
}

export function isAdmin(u: CurrentUser | null): boolean {
  return !!u && u.role === "admin";
}

/**
 * API guard. Usage:
 *   const auth = await requireRoles(["sales"]);
 *   if (!auth.ok) return auth.res;
 *   const user = auth.user;
 */
export async function requireRoles(allowed: WorkspaceRole[]): Promise<
  { ok: true; user: CurrentUser } | { ok: false; res: Response }
> {
  await ensureRbacSchema();
  const user = await getCurrentUser();
  if (!user) return { ok: false, res: Response.json({ error: "Unauthorized — please log in" }, { status: 401 }) };
  if (user.role === "admin") return { ok: true, user }; // admin passes every gate
  if (!allowed.includes(user.role))
    return { ok: false, res: Response.json({ error: "Forbidden — insufficient role" }, { status: 403 }) };
  return { ok: true, user };
}

/** Append-only audit entry. Employees can never modify audit_log (no API). */
export async function audit(entry: {
  userId: number | null; role: string; action: string; object: string;
  objectId?: string | number | null; prev?: any; next?: any;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, role, action, object, object_id, prev, new_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entry.userId, entry.role.slice(0, 20), entry.action.slice(0, 80), entry.object.slice(0, 40),
       String(entry.objectId ?? "").slice(0, 60), JSON.stringify(entry.prev ?? {}).slice(0, 2000),
       JSON.stringify(entry.next ?? {}).slice(0, 2000)]);
  } catch (e) {
    console.error("audit failed (non-fatal):", e);
  }
}

export async function notify(n: {
  userId?: number | null; role?: string; title: string; body?: string; link?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, role_target, title, body, link) VALUES ($1,$2,$3,$4,$5)`,
      [n.userId ?? null, (n.role || "all").slice(0, 20), n.title.slice(0, 200),
       (n.body || "").slice(0, 1000), (n.link || "").slice(0, 300)]);
  } catch (e) {
    console.error("notify failed (non-fatal):", e);
  }
}

// ---------------------------------------------------------------------------
// Employee management (admin-only callers — routes enforce).
// ---------------------------------------------------------------------------
export async function createEmployee(input: { name: string; email: string; password: string; role: WorkspaceRole }): Promise<{ id: number }> {
  await ensureRbacSchema();
  const email = input.email.toLowerCase().trim();
  if (!email.includes("@")) throw new Error("valid email required");
  if (!input.password || input.password.length < 8) throw new Error("password must be 8+ characters");
  if (!["admin", "sales", "social"].includes(input.role)) throw new Error("bad role");
  try {
    const ins = await pool.query(
      `INSERT INTO kb_users (email, name, password_hash, role, workspace_role, is_active)
       VALUES ($1,$2,$3,'admin',$4,true) RETURNING id`,
      [email, input.name.slice(0, 120), hashPassword(input.password), input.role]);
    return { id: Number(ins.rows[0].id) };
  } catch (e: any) {
    if (String(e?.message || "").includes("duplicate") || String(e?.code) === "23505")
      throw new Error("email already exists");
    throw e;
  }
}

export async function setEmployeeStatus(id: number, active: boolean): Promise<void> {
  await pool.query(`UPDATE kb_users SET is_active = $2, updated_at = now() WHERE id = $1`, [id, active]);
  if (!active) {
    await endUserSessions(id, "disabled");
    await pool.query(`DELETE FROM kb_sessions WHERE user_id = $1`, [id]); // kill sessions
  }
}

export async function setEmployeeRole(id: number, role: WorkspaceRole): Promise<void> {
  if (!["admin", "sales", "social"].includes(role)) throw new Error("bad role");
  const me = await pool.query(`SELECT count(*)::int n FROM kb_users WHERE id <> $1 AND is_active = true AND COALESCE(workspace_role,'admin') = 'admin'`, [id]);
  const cur = (await pool.query(`SELECT COALESCE(workspace_role,'admin') r FROM kb_users WHERE id = $1`, [id])).rows[0]?.r;
  if (cur === "admin" && role !== "admin" && Number(me.rows[0]?.n || 0) === 0)
    throw new Error("cannot demote the last active admin");
  await pool.query(`UPDATE kb_users SET workspace_role = $2, updated_at = now() WHERE id = $1`, [id, role]);
}

export async function listEmployees(): Promise<any[]> {
  await ensureRbacSchema();
  const r = await pool.query(
    `SELECT u.id, u.email, u.name, COALESCE(u.workspace_role,'admin') AS workspace_role,
            u.is_active, u.last_active_at, u.last_login_at, u.created_at,
            (SELECT count(*)::int FROM leads l WHERE l.owner_id = u.id) AS assigned_leads,
            (SELECT count(*)::int FROM sales_tasks t WHERE t.user_id = u.id AND t.status = 'open') AS open_tasks,
            (SELECT count(*)::int FROM content_tasks t WHERE t.assignee_id = u.id AND t.status <> 'done') AS open_content_tasks,
            ls.logged_in_at AS session_started_at,
            ls.last_seen_at AS session_last_seen,
            ls.logged_out_at AS session_ended_at,
            GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(ls.logged_out_at, ls.last_seen_at) - ls.logged_in_at))::int) AS last_session_secs,
            (ls.logged_out_at IS NULL AND ls.last_seen_at > now() - interval '10 minutes') AS is_online,
            (SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.logged_out_at, s.last_seen_at) - s.logged_in_at)))),0)::int
               FROM employee_sessions s
              WHERE s.user_id = u.id
                AND timezone('Asia/Kolkata', s.logged_in_at)::date = timezone('Asia/Kolkata', now())::date
            ) AS today_secs
     FROM kb_users u
     LEFT JOIN LATERAL (
       SELECT logged_in_at, last_seen_at, logged_out_at
       FROM employee_sessions s WHERE s.user_id = u.id
       ORDER BY s.logged_in_at DESC LIMIT 1
     ) ls ON true
     ORDER BY u.id`);
  return r.rows;
}

/** Assign (or unassign with null) leads. Audited per call, not per row. */
export async function assignLeads(leadIds: number[], userId: number | null, actor: CurrentUser): Promise<{ assigned: number }> {
  await ensureRbacSchema();
  const ids = [...new Set(leadIds.map(Number).filter(Boolean))].slice(0, 200);
  if (!ids.length) return { assigned: 0 };
  if (userId !== null) {
    const u = await pool.query(`SELECT id FROM kb_users WHERE id = $1 AND is_active = true`, [userId]);
    if ((u.rowCount ?? 0) === 0) throw new Error("assignee not found or disabled");
  }
  const r = await pool.query(`UPDATE leads SET owner_id = $2 WHERE id = ANY($1)`, [ids, userId]);
  await audit({ userId: actor.id, role: actor.role, action: userId ? "leads.assigned" : "leads.unassigned",
    object: "leads", objectId: ids.slice(0, 10).join(","), next: { count: r.rowCount, to: userId } });
  if (userId) {
    await notify({ userId, title: `📌 ${r.rowCount} lead(s) assigned to you`, body: "Open your workspace to work them.", link: "/sales/leads" });
  }
  return { assigned: r.rowCount ?? 0 };
}

// Employee login / presence tracking.
// One row per cookie session. Duration = last_seen (or logout) − login.
// Heartbeats from getCurrentUser + a 2-min client ping while the tab is visible.
import { pool } from "@/db";

export async function ensurePresenceSchema(): Promise<void> {
  await pool.query(`ALTER TABLE kb_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz`);
  await pool.query(`ALTER TABLE kb_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_sessions (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES kb_users(id) ON DELETE CASCADE,
      session_id text,
      logged_in_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      logged_out_at timestamptz,
      end_reason text NOT NULL DEFAULT '',
      ip text,
      user_agent text
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_sess_user_time ON employee_sessions(user_id, logged_in_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emp_sess_open ON employee_sessions(user_id) WHERE logged_out_at IS NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_emp_sess_sid ON employee_sessions(session_id)`);
}

export async function recordLogin(userId: number, sessionId: string, ip?: string | null, userAgent?: string | null): Promise<void> {
  try {
    await ensurePresenceSchema();
    await pool.query(
      `INSERT INTO employee_sessions (user_id, session_id, ip, user_agent)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (session_id) DO UPDATE SET last_seen_at = now()`,
      [userId, sessionId, (ip || "").slice(0, 80) || null, (userAgent || "").slice(0, 180) || null]);
    await pool.query(`UPDATE kb_users SET last_login_at = now() WHERE id = $1`, [userId]);
  } catch (e) {
    console.error("recordLogin failed (non-fatal):", e);
  }
}

/** Heartbeat: bump last_seen. If this cookie predates tracking, open a row. */
export async function touchPresence(userId: number, sessionId: string): Promise<void> {
  try {
    const u = await pool.query(
      `UPDATE employee_sessions SET last_seen_at = now()
       WHERE session_id = $1 AND logged_out_at IS NULL
         AND last_seen_at < now() - interval '45 seconds'`,
      [sessionId]);
    if ((u.rowCount ?? 0) === 0) {
      const open = await pool.query(
        `SELECT id FROM employee_sessions WHERE session_id = $1 AND logged_out_at IS NULL LIMIT 1`,
        [sessionId]);
      if ((open.rowCount ?? 0) === 0) {
        const live = await pool.query(`SELECT 1 FROM kb_sessions WHERE id = $1 AND expires_at > now() LIMIT 1`, [sessionId]);
        if ((live.rowCount ?? 0) > 0) {
          await pool.query(
            `INSERT INTO employee_sessions (user_id, session_id) VALUES ($1,$2)
             ON CONFLICT (session_id) DO UPDATE SET last_seen_at = now()`,
            [userId, sessionId]);
        }
      }
    }
    await pool.query(
      `UPDATE kb_users SET last_active_at = now()
       WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '5 minutes')`,
      [userId]);
  } catch {
    // never break a page load over presence
  }
}

export async function endSession(sessionId: string, reason: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE employee_sessions
       SET logged_out_at = now(), last_seen_at = now(), end_reason = $2
       WHERE session_id = $1 AND logged_out_at IS NULL`,
      [sessionId, (reason || "logout").slice(0, 40)]);
  } catch (e) {
    console.error("endSession failed (non-fatal):", e);
  }
}

export async function endUserSessions(userId: number, reason: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE employee_sessions
       SET logged_out_at = now(), last_seen_at = now(), end_reason = $2
       WHERE user_id = $1 AND logged_out_at IS NULL`,
      [userId, (reason || "ended").slice(0, 40)]);
  } catch (e) {
    console.error("endUserSessions failed (non-fatal):", e);
  }
}

export async function listLoginHistory(limit = 200): Promise<any[]> {
  await ensurePresenceSchema();
  const r = await pool.query(
    `SELECT s.id, s.user_id, u.name, u.email, COALESCE(u.workspace_role,'admin') AS workspace_role,
            s.logged_in_at, s.last_seen_at, s.logged_out_at, s.end_reason, s.ip,
            EXTRACT(EPOCH FROM (COALESCE(s.logged_out_at, s.last_seen_at) - s.logged_in_at))::int AS duration_secs,
            (s.logged_out_at IS NULL AND s.last_seen_at > now() - interval '10 minutes') AS is_online
     FROM employee_sessions s
     JOIN kb_users u ON u.id = s.user_id
     ORDER BY s.logged_in_at DESC
     LIMIT $1`,
    [Math.min(500, Math.max(1, limit))]);
  return r.rows;
}

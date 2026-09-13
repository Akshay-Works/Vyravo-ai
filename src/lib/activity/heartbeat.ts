// ============================================================================
// AUTOMATION HEARTBEATS — one row per job (reply_poll, cron_emails,
// cron_kick_engine) recording the last run + outcome. Powers the Tier 3
// health tab with REAL execution signals instead of guesses.
// recordHeartbeat NEVER throws: a heartbeat must never break the job it
// observes. Keys are fixed; no duplicate rows are possible (PK on key).
// ============================================================================
import { pool } from "@/db";

export async function ensureHeartbeatSchema(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS automation_heartbeats (
    key text PRIMARY KEY,
    last_run timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'ok',
    detail jsonb,
    updated_at timestamptz DEFAULT now()
  )`);
}

export async function recordHeartbeat(key: string, status: "ok" | "error" | "skipped", detail: any = {}): Promise<void> {
  try {
    await ensureHeartbeatSchema();
    await pool.query(
      `INSERT INTO automation_heartbeats (key, last_run, status, detail, updated_at)
       VALUES ($1, now(), $2, $3, now())
       ON CONFLICT (key) DO UPDATE SET last_run = now(), status = $2, detail = $3, updated_at = now()`,
      [key, status, JSON.stringify(detail ?? {})]
    );
  } catch (e) {
    console.error(`heartbeat ${key} failed (non-fatal):`, e);
  }
}

export async function readHeartbeats(keys: string[]): Promise<Record<string, { last_run: string; status: string; detail: any }>> {
  try {
    const r = await pool.query(`SELECT key, last_run, status, detail FROM automation_heartbeats WHERE key = ANY($1::text[])`, [keys]);
    return Object.fromEntries(r.rows.map((x: any) => [x.key, { last_run: x.last_run, status: x.status, detail: x.detail || {} }]));
  } catch {
    return {}; // table not created yet (no job has run since deploy)
  }
}

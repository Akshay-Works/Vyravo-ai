// Knowledge Base Auth — integrates with the EXISTING auth schema
// (kb_users with scrypt password hashes + kb_sessions opaque session ids).
// Falls back to a shared admin password (KB_ADMIN_PASSWORD env var) when no
// user row matches, so the feature is usable even before users are provisioned.

import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool } from "@/db";

const SESSION_COOKIE = "kb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface AdminSession {
  userId: number | null;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  spaceId: number | null;
}

// ---------------------------------------------------------------------------
// scrypt verification (format: scrypt$<salt-hex>$<hash-hex>, hash = 64 bytes)
// ---------------------------------------------------------------------------
export function verifyScryptPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, hashHex] = parts;
    if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session management (opaque tokens in kb_sessions + httpOnly cookie)
// ---------------------------------------------------------------------------
export async function createSession(
  userId: number,
  ip?: string,
  userAgent?: string
): Promise<string> {
  const sessionId = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO kb_sessions (id, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, userId, new Date(Date.now() + SESSION_TTL_MS), ip || null, userAgent || null]
  );
  return sessionId;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const store = await cookies();
    const sessionId = store.get(SESSION_COOKIE)?.value;
    if (!sessionId) return null;

    const res = await pool.query(
      `SELECT s.user_id, s.expires_at, u.email, u.name, u.role, u.space_id, u.is_active
       FROM kb_sessions s
       JOIN kb_users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [sessionId]
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    if (!row.is_active) return null;

    return {
      userId: row.user_id,
      email: row.email || "admin@vyravo.ai",
      name: row.name || "Vyravo Admin",
      role: (row.role || "admin") as AdminSession["role"],
      spaceId: row.space_id != null ? Number(row.space_id) : null,
    };
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function sessionTtlSeconds(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}

/**
 * Attempt login against the existing kb_users table.
 * Returns the user row on success, null when email/password don't match.
 */
export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ id: number; email: string; name: string; role: string; spaceId: number | null } | null> {
  const res = await pool.query(
    `SELECT id, email, name, password_hash, role, space_id, is_active
     FROM kb_users WHERE lower(email) = lower($1) LIMIT 1`,
    [email.trim()]
  );
  if (res.rowCount === 0) return null;
  const user = res.rows[0];
  if (!user.is_active) return null;
  if (!user.password_hash) return null;
  if (!verifyScryptPassword(password, user.password_hash)) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    role: user.role || "admin",
    spaceId: user.space_id != null ? Number(user.space_id) : null,
  };
}

/** Fallback: shared admin password from env (or dev default). */
export function checkEnvAdminPassword(submitted: string): boolean {
  const configured = process.env.KB_ADMIN_PASSWORD;
  if (!configured) return submitted === "vyravo-admin";
  return timingSafeEqual(
    Buffer.from(submitted),
    Buffer.from(configured)
  );
}

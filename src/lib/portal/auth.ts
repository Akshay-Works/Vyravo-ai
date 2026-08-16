// Portal Authentication — uses the same scrypt pattern as kb_users/kb_sessions.
// Client users are stored in the new `client_users` table with scrypt password
// hashes, and sessions use opaque tokens in `client_sessions`.
// Architects for future Google/Microsoft login, magic links, and 2FA.

import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { pool } from "@/db";

const SESSION_COOKIE = "portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export interface PortalSession {
  userId: number;
  clientId: number;
  email: string;
  name: string;
  role: "owner" | "admin" | "viewer";
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt — same format as existing kb_users)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, hashHex] = parts;
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session management (opaque tokens in client_sessions + httpOnly cookie)
// ---------------------------------------------------------------------------
export async function createClientSession(
  userId: number,
  clientId: number,
  ip?: string,
  userAgent?: string
): Promise<string> {
  const sessionId = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO client_sessions (id, user_id, client_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, userId, clientId, new Date(Date.now() + SESSION_TTL_MS), ip || null, userAgent || null]
  );
  return sessionId;
}

export async function getPortalSession(): Promise<PortalSession | null> {
  try {
    const store = await cookies();
    const sessionId = store.get(SESSION_COOKIE)?.value;
    if (!sessionId) return null;

    const res = await pool.query(
      `SELECT s.user_id, s.client_id, s.expires_at, u.email, u.name, u.role, u.is_active
       FROM client_sessions s
       JOIN client_users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [sessionId]
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    if (!row.is_active) return null;

    return {
      userId: row.user_id,
      clientId: Number(row.client_id),
      email: row.email,
      name: row.name,
      role: (row.role || "viewer") as PortalSession["role"],
    };
  } catch {
    return null;
  }
}

export async function isPortalAuthenticated(): Promise<boolean> {
  return (await getPortalSession()) !== null;
}

export async function requirePortalAuth(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) {
    // This is meant for API routes — the caller should handle the redirect.
    // Throwing here gives the API route a chance to return 401.
    throw new Error("unauthorized");
  }
  return session;
}

/** Get the client_id from the current session (convenience for queries). */
export async function getClientId(): Promise<number> {
  const session = await requirePortalAuth();
  return session.clientId;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function sessionTtlSeconds(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  loginWithCredentials,
  checkEnvAdminPassword,
  createSession,
  sessionCookieName,
  sessionTtlSeconds,
  isAdminAuthenticated,
} from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// POST /api/auth/admin — login (email+password via existing kb_users, or
// shared admin password via KB_ADMIN_PASSWORD)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (typeof password !== "string" || !password) {
      return Response.json({ error: "Password is required" }, { status: 400 });
    }

    let userId: number | null = null;
    let name = "Vyravo Admin";
    let role: string = "admin";

    // 1) Try existing kb_users credentials
    if (typeof email === "string" && email.trim()) {
      const user = await loginWithCredentials(email, password);
      if (user) {
        userId = user.id;
        name = user.name;
        role = user.role;
      }
    }

    // 2) Fallback: shared admin password (KB_ADMIN_PASSWORD)
    if (userId === null && checkEnvAdminPassword(password)) {
      // Provision/reuse the default admin@vyravo.ai row so sessions stay consistent
      const existing = await pool.query(
        `SELECT id FROM kb_users WHERE lower(email) = 'admin@vyravo.ai' LIMIT 1`
      );
      if ((existing.rowCount ?? 0) > 0) {
        userId = existing.rows[0].id;
      } else {
        const ins = await pool.query(
          `INSERT INTO kb_users (email, name, role, space_id, is_active)
           VALUES ('admin@vyravo.ai', 'Vyravo Admin', 'admin', 1, true)
           RETURNING id`
        );
        userId = ins.rows[0].id;
      }
    }

    if (userId === null) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Create session in the existing kb_sessions table
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;
    const sessionId = await createSession(userId, ip || undefined, userAgent || undefined);

    const store = await cookies();
    store.set(sessionCookieName(), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionTtlSeconds(),
    });

    return Response.json({ success: true, name, role });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

// GET /api/auth/admin — session status
export async function GET() {
  const authed = await isAdminAuthenticated();
  return Response.json({ authenticated: authed });
}

// DELETE /api/auth/admin — logout
export async function DELETE() {
  try {
    const store = await cookies();
    const sessionId = store.get(sessionCookieName())?.value;
    if (sessionId) {
      await pool.query(`DELETE FROM kb_sessions WHERE id = $1`, [sessionId]);
    }
    store.delete(sessionCookieName());
  } catch {
    // best-effort
  }
  return Response.json({ success: true });
}

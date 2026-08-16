import { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/knowledge-base/rate-limit";
import { getPortalSession, verifyPassword, createClientSession, sessionCookieName, sessionTtlSeconds, hashPassword } from "@/lib/portal/auth";
import { registerClient } from "@/lib/portal/engine";
import { emitEvent } from "@/lib/workflows/engine";
import { cookies } from "next/headers";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// POST /api/portal/auth — login
export async function POST(request: NextRequest) {
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return Response.json({ error: "Too many requests" }, { status: 429 }); }

  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });

    const res = await pool.query(
      `SELECT id, client_id, name, password_hash, role, is_active FROM client_users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    if (res.rowCount === 0) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const user = res.rows[0];
    if (!user.is_active) return Response.json({ error: "Account is inactive" }, { status: 403 });
    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = request.headers.get("user-agent") || null;
    const sessionId = await createClientSession(Number(user.id), Number(user.client_id), ip || undefined, ua || undefined);

    await pool.query(`UPDATE client_users SET last_login_at = now() WHERE id = $1`, [user.id]);

    const store = await cookies();
    store.set(sessionCookieName(), sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: sessionTtlSeconds(),
    });

    try { await emitEvent("portal_login", { clientId: Number(user.client_id), metadata: { userId: user.id } }); } catch {}
    return Response.json({ success: true, name: user.name, role: user.role });
  } catch (e) {
    console.error("Portal login error:", e);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

// GET /api/portal/auth — session status
export async function GET() {
  const session = await getPortalSession();
  return Response.json({ authenticated: !!session, user: session ? { name: session.name, email: session.email, role: session.role } : null });
}

// DELETE /api/portal/auth — logout
export async function DELETE() {
  try {
    const store = await cookies();
    const sid = store.get(sessionCookieName())?.value;
    if (sid) await pool.query(`DELETE FROM client_sessions WHERE id = $1`, [sid]);
    store.delete(sessionCookieName());
  } catch {}
  return Response.json({ success: true });
}

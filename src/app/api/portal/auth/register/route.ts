import { NextRequest } from "next/server";
import { rateLimit, clientIp } from "@/lib/knowledge-base/rate-limit";
import { hashPassword, createClientSession, sessionCookieName, sessionTtlSeconds } from "@/lib/portal/auth";
import { registerClient } from "@/lib/portal/engine";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// POST /api/portal/auth/register — client self-registers (invitation-based)
export async function POST(request: NextRequest) {
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return Response.json({ error: "Too many requests" }, { status: 429 }); }

  try {
    const body = await request.json();
    const { email, password, name, companyName, invitationToken } = body;
    if (!email || !password || !name) {
      return Response.json({ error: "Name, email, and password are required" }, { status: 400 });
    }
    if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    const { pool } = await import("@/db");
    const exists = await pool.query(`SELECT id FROM client_users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    if ((exists.rowCount ?? 0) > 0) return Response.json({ error: "An account with this email already exists" }, { status: 409 });

    const passwordHash = hashPassword(password);
    const result = await registerClient(name, companyName || name, email, passwordHash);

    const store = await cookies();
    const sessionId = await createClientSession(result.clientUserId, result.clientId);
    store.set("portal_session", sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60,
    });

    return Response.json({ success: true }, { status: 201 });
  } catch (e: any) {
    console.error("Portal register error:", e);
    if (e.message?.includes("duplicate key")) return Response.json({ error: "An account with this email already exists" }, { status: 409 });
    return Response.json({ error: "Registration failed" }, { status: 500 });
  }
}

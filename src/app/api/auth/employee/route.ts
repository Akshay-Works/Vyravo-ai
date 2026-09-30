import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/db";
import {
  loginWithCredentials, createSession, sessionCookieName, sessionTtlSeconds,
} from "@/lib/knowledge-base/auth";
import { ensureRbacSchema } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

// POST /api/auth/employee — { email, password }.
// Role comes from the server-side profile ONLY (never from the client).
// Returns the workspace URL to redirect to.
export async function POST(request: NextRequest) {
  await ensureRbacSchema();
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || "").trim();
  const password = String(b.password || "");
  if (!email || !password) return Response.json({ error: "Email + password required" }, { status: 400 });

  const user = await loginWithCredentials(email, password);
  if (!user) return Response.json({ error: "Invalid email or password" }, { status: 401 });

  const r = await pool.query(`SELECT COALESCE(workspace_role,'admin') AS w FROM kb_users WHERE id = $1`, [user.id]);
  const w = String(r.rows[0]?.w || "admin").toLowerCase();
  const role = w === "sales" || w === "social" ? w : "admin";

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = request.headers.get("user-agent") || null;
  const sessionId = await createSession(user.id, ip || undefined, ua || undefined);
  await pool.query(`UPDATE kb_users SET last_login_at = now() WHERE id = $1`, [user.id]);

  const store = await cookies();
  store.set(sessionCookieName(), sessionId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: sessionTtlSeconds(),
  });
  const redirect = role === "sales" ? "/sales" : role === "social" ? "/social" : "/admin";
  return Response.json({ ok: true, role, redirect, name: user.name });
}

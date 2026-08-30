import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";

export const dynamic = "force-dynamic";

const TRACKER_API = (process.env.TRACKER_API_URL || "https://vyravo-tracker.vercel.app").replace(/\/$/, "");

// GET /api/admin/visitors?limit=1500
// Server-side proxy to the visitor tracker's /api/visits feed.
// The tracker key stays server-side (TRACKER_DASHBOARD_KEY = tracker's DASHBOARD_KEY).
// Visitor analytics is admin-only: never exposed on public pages.
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const key = (process.env.TRACKER_DASHBOARD_KEY || "").trim();
  if (!key) {
    return Response.json(
      { error: "TRACKER_DASHBOARD_KEY env not set on this project — add it (same value as the tracker's DASHBOARD_KEY)." },
      { status: 501 }
    );
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || "1500"), 1), 2000);
  try {
    const r = await fetch(`${TRACKER_API}/api/visits?key=${encodeURIComponent(key)}&limit=${limit}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) {
      return Response.json({ error: `Tracker feed failed (${r.status})` }, { status: 502 });
    }
    const data = await r.json();
    return Response.json({ ok: true, rows: data.rows || [], fetchedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Visitors proxy error:", e);
    return Response.json({ error: "Tracker unreachable" }, { status: 502 });
  }
}

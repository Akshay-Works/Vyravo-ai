import { NextRequest } from "next/server";
import { pool } from "@/db";
import { ensureForeignSchema } from "@/lib/foreign/schema";
import { getForeignSettings } from "@/lib/foreign/settings";
import { engineAuthed } from "@/lib/foreign/auth";

export const dynamic = "force-dynamic";

// GET /api/foreign/runtime — engine asks at run start: paused? last run?
// settings snapshot (admin wins over engine defaults).
export async function GET(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const [settings, run] = await Promise.all([
      getForeignSettings(),
      pool.query(`SELECT started_at, status FROM foreign_runs ORDER BY id DESC LIMIT 1`),
    ]);
    const last = run.rows[0] || null;
    return Response.json({
      paused: settings.paused,
      lastRun: last?.started_at || null,
      lastRunStatus: last?.status || null,
      settings,
    });
  } catch (e: any) {
    console.error("foreign runtime error:", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

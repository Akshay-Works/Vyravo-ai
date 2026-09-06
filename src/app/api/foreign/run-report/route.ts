import { NextRequest } from "next/server";
import { pool } from "@/db";
import { ensureForeignSchema } from "@/lib/foreign/schema";
import { engineAuthed } from "@/lib/foreign/auth";

export const dynamic = "force-dynamic";

// POST /api/foreign/run-report — engine finishes a run: store the summary
// row (last-run panel in the dashboard reads this).
export async function POST(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  try {
    await ensureForeignSchema();
    const r = await pool.query(
      `INSERT INTO foreign_runs
        (trigger, mode, started_at, ended_at, leads_discovered, leads_qualified,
         emails_found, emails_verified, duplicates_removed, leads_saved, leads_merged,
         failed, errors, status, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        String(b.trigger || "schedule").slice(0, 20),
        (String(b.trigger || "") === "test" ? "test" : String(b.mode || "normal")).slice(0, 20),
        b.startedAt ? new Date(b.startedAt) : new Date(),
        b.endedAt ? new Date(b.endedAt) : new Date(),
        Number(b.leadsDiscovered) || 0, Number(b.leadsQualified) || 0,
        Number(b.emailsFound) || 0, Number(b.emailsVerified) || 0,
        Number(b.duplicatesRemoved) || 0, Number(b.leadsSaved) || 0,
        Number(b.leadsMerged) || 0, Number(b.failed) || 0,
        Number(b.errors) || 0, String(b.status || "success").slice(0, 20),
        String(b.error || "").slice(0, 400) || null,
      ]
    );
    return Response.json({ success: true, runId: r.rows[0].id });
  } catch (e: any) {
    console.error("foreign run-report error:", e);
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
}

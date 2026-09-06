import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureForeignSchema } from "@/lib/foreign/schema";

export const dynamic = "force-dynamic";

// GET /api/admin/foreign/runs — job history (last-run panel).
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const r = await pool.query(
      `SELECT id, trigger, mode, started_at, ended_at, status, leads_discovered, leads_qualified,
              emails_found, emails_verified, duplicates_removed, leads_saved, leads_merged,
              failed, errors, error
       FROM foreign_runs ORDER BY id DESC LIMIT 50`
    );
    return Response.json({ runs: r.rows });
  } catch (e: any) {
    console.error("foreign runs error:", e);
    return Response.json({ error: "Failed to load runs" }, { status: 500 });
  }
}

// POST /api/admin/foreign/runs  body: {} — delete failed/partial run records
// ("Clear Failed Jobs"). Running rows are never touched.
export async function POST() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureForeignSchema();
    const r = await pool.query(
      `DELETE FROM foreign_runs WHERE status IN ('failed','partial_failure') RETURNING id`
    );
    return Response.json({ ok: true, cleared: r.rowCount || 0 });
  } catch (e: any) {
    console.error("foreign runs clear error:", e);
    return Response.json({ error: "Failed to clear" }, { status: 500 });
  }
}

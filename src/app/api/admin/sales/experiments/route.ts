import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { ensureExperimentSchema, getExperimentResults } from "@/lib/sales/experiments";

export const dynamic = "force-dynamic";

// GET → experiments + per-variant results.
// POST { action: create|pause|resume, name?, description?, variants?[{key,weight}] }
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ ok: true, experiments: await getExperimentResults() });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureExperimentSchema();
  const b = await request.json().catch(() => ({}));
  const action = String(b.action || "");
  const name = String(b.name || "").trim().slice(0, 80);
  if (action === "create") {
    const variants = Array.isArray(b.variants) ? b.variants : [];
    if (!name || variants.length < 2) return Response.json({ error: "name + 2+ variants required" }, { status: 400 });
    for (const v of variants) {
      if (!v.key || !(Number(v.weight) > 0)) return Response.json({ error: "each variant needs key + weight > 0" }, { status: 400 });
    }
    await pool.query(`INSERT INTO sales_experiments (name, description, status, variants) VALUES ($1,$2,'paused',$3)
      ON CONFLICT (name) DO UPDATE SET description = $2, variants = $3, updated_at = now()`,
      [name, String(b.description || "").slice(0, 500), JSON.stringify(variants.map((v: any) => ({ key: String(v.key).slice(0, 40), weight: Number(v.weight) })))]);
    return Response.json({ ok: true, status: "paused" });
  }
  if ((action === "pause" || action === "resume") && name) {
    await pool.query(`UPDATE sales_experiments SET status = $2, updated_at = now() WHERE name = $1`, [name, action === "resume" ? "active" : "paused"]);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}

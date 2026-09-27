import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { logDecision } from "@/lib/sales/schema";

export const dynamic = "force-dynamic";

// GET → current pause state. POST { paused: bool } → global sales kill-switch (§28).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = await pool.query(`SELECT v FROM outreach_config WHERE k = 'sales_paused'`);
  const paused = String(r.rows[0]?.v || "").toLowerCase() === "true";
  return Response.json({ ok: true, paused });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const paused = b.paused === true;
  await pool.query(`INSERT INTO outreach_config (k, v) VALUES ('sales_paused', $1)
    ON CONFLICT (k) DO UPDATE SET v = $1`, [paused ? "true" : "false"]);
  await logDecision({ trigger_text: "sales:pause", action: paused ? "paused" : "resumed",
    autonomy: "none", reason: `global sales automation ${paused ? "PAUSED" : "RESUMED"} by admin`, result: paused ? "paused" : "resumed" });
  return Response.json({ ok: true, paused });
}

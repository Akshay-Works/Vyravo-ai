import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// GET /api/admin/email-templates/leads — leads that can receive personalized email.
// Excludes already-contacted / won / lost / do-not-contact. Missing email = skip.
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const minScore = Number(searchParams.get("minScore") || "0");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "200"), 1), 500);
    const r = await pool.query(
      `SELECT id, full_name, email, business_name, business_website, industry, country,
              lead_score, lead_category, biggest_challenge, qualification_summary, status, stage
       FROM leads
       WHERE email IS NOT NULL AND TRIM(email) <> ''
         AND status NOT IN ('contacted', 'won', 'lost', 'do_not_contact')
         AND lead_score >= $1
       ORDER BY lead_score DESC, id DESC
       LIMIT $2`,
      [minScore, limit]
    );
    return Response.json({ leads: r.rows });
  } catch (e) {
    console.error("Template leads error:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

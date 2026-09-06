import { NextRequest } from "next/server";
import { pool } from "@/db";
import { engineAuthed } from "@/lib/foreign/auth";

export const dynamic = "force-dynamic";

// GET /api/foreign/known — compact dedupe key set for the engine
// (bounded: newest 5000 foreign + local leads; phone excluded on purpose).
export async function GET(request: NextRequest) {
  if (!engineAuthed(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await pool.query(
      `SELECT id, business_name AS name, business_website AS domain, email, linkedin_url AS linkedin
       FROM leads
       WHERE email IS NOT NULL OR business_website IS NOT NULL OR linkedin_url IS NOT NULL
       ORDER BY id DESC LIMIT 5000`
    );
    return Response.json({ leads: r.rows });
  } catch (e: any) {
    console.error("foreign known error:", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}

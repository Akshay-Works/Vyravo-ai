import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  tiers: [
    { name: "Tier 1", countries: ["USA", "Australia", "UK", "Canada"] },
    { name: "Tier 2", countries: ["UAE", "Singapore", "New Zealand"] },
    { name: "Tier 3", cities: ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi NCR"] },
  ],
  industries: [
    "real estate", "cleaning services", "recruitment", "marketing agency", "legal",
    "healthcare", "home services", "financial services", "hospitality", "e-commerce",
    "education", "professional services",
  ],
  targetCountries: [] as string[],
  targetCities: [] as string[],
  minScore: 70,
  dailyTarget: 50,
  maxSitesAnalyzed: 40,
  maxDmLookups: 15,
  maxSearchQueries: 12,
  braveQueries: 10,
  reportEmail: "",
  senderEmail: "onboarding@resend.dev",
};

const EDITABLE = ["targetCountries", "targetCities", "minScore", "dailyTarget", "maxSitesAnalyzed", "maxDmLookups", "maxSearchQueries", "braveQueries", "reportEmail", "senderEmail", "industries"];

export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS funnel2_config (id int PRIMARY KEY DEFAULT 1, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`);
    const r = await pool.query(`SELECT data, updated_at FROM funnel2_config WHERE id = 1`);
    const stored = r.rows[0]?.data || {};
    const config: any = { ...DEFAULTS, ...stored };
    delete config.dbUrl; // never expose the connection string
    return Response.json({ config, stored: !!r.rows[0], updatedAt: r.rows[0]?.updated_at || null });
  } catch (e: any) {
    console.error("funnel2 config get:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Bad body" }, { status: 400 });
  const out: any = {};
  for (const k of EDITABLE) {
    if (k in body) {
      if (["minScore", "dailyTarget", "maxSitesAnalyzed", "maxDmLookups", "maxSearchQueries", "braveQueries"].includes(k)) {
        const n = Number(body[k]);
        if (!Number.isFinite(n) || n < 1 || n > 500) return Response.json({ error: `Bad ${k}` }, { status: 400 });
        out[k] = Math.round(n);
      } else if (["targetCountries", "targetCities", "industries"].includes(k)) {
        if (!Array.isArray(body[k]) || body[k].some((x: any) => typeof x !== "string")) return Response.json({ error: `Bad ${k}` }, { status: 400 });
        out[k] = body[k].map((x: string) => x.trim()).filter(Boolean);
      } else if (typeof body[k] === "string") {
        out[k] = body[k].trim().slice(0, 200);
      }
    }
  }
  if (!Object.keys(out).length) return Response.json({ error: "Nothing to save" }, { status: 400 });
  try {
    await pool.query(`INSERT INTO funnel2_config (id, data, updated_at) VALUES (1, $1::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = funnel2_config.data || EXCLUDED.data, updated_at = now()`, [JSON.stringify(out)]);
    const r = await pool.query(`SELECT data, updated_at FROM funnel2_config WHERE id = 1`);
    const config: any = { ...DEFAULTS, ...(r.rows[0]?.data || {}) };
    delete config.dbUrl;
    return Response.json({ ok: true, config, updatedAt: r.rows[0]?.updated_at || null });
  } catch (e: any) {
    console.error("funnel2 config put:", e);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}

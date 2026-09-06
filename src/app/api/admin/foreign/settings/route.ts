import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getForeignSettings, saveForeignSettings, DEFAULT_FOREIGN_SETTINGS, type ForeignSettings } from "@/lib/foreign/settings";

export const dynamic = "force-dynamic";

// GET/PUT /api/admin/foreign/settings — engine knobs (Admin session only).
export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, settings: await getForeignSettings(), defaults: DEFAULT_FOREIGN_SETTINGS });
  } catch (e: any) {
    console.error("foreign settings error:", e);
    return Response.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = (await request.json().catch(() => ({}))) as Partial<ForeignSettings>;
    const patch: Partial<ForeignSettings> = {
      dailyDirect: typeof b.dailyDirect === "number" ? b.dailyDirect : undefined,
      dailyAgency: typeof b.dailyAgency === "number" ? b.dailyAgency : undefined,
      minScore: typeof b.minScore === "number" ? b.minScore : undefined,
      requireVerifiedEmail: typeof b.requireVerifiedEmail === "boolean" ? b.requireVerifiedEmail : undefined,
      requireDecisionMaker: typeof b.requireDecisionMaker === "boolean" ? b.requireDecisionMaker : undefined,
      countries: Array.isArray(b.countries) ? b.countries.map(String).map((c) => c.toLowerCase().slice(0, 2)).slice(0, 20) : undefined,
      industries: Array.isArray(b.industries) ? b.industries.map(String).slice(0, 40) : undefined,
      paused: typeof b.paused === "boolean" ? b.paused : undefined,
    };
    return Response.json({ ok: true, settings: await saveForeignSettings(patch) });
  } catch (e: any) {
    console.error("foreign settings save error:", e);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

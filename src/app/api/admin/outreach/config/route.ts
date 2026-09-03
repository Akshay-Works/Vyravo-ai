import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { saveOutreachConfig, type OutreachConfig } from "@/lib/outreach/config";
import { ensureOutreachSchema } from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";

// PUT /api/admin/outreach/config — admin knobs (auto ON/OFF, daily limit,
// follow-up delays, min gap, test mode + test recipient)
export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureOutreachSchema();
    const body = (await request.json().catch(() => ({}))) as Partial<OutreachConfig>;
    const cfg = await saveOutreachConfig({
      auto_outreach: typeof body.auto_outreach === "boolean" ? body.auto_outreach : undefined,
      test_mode: typeof body.test_mode === "boolean" ? body.test_mode : undefined,
      test_recipient: typeof body.test_recipient === "string" ? body.test_recipient : undefined,
      daily_limit: typeof body.daily_limit === "number" ? body.daily_limit : undefined,
      follow_up_days: Array.isArray(body.follow_up_days) ? body.follow_up_days.map(Number) : undefined,
      min_gap_secs: typeof body.min_gap_secs === "number" ? body.min_gap_secs : undefined,
      min_score: typeof body.min_score === "number" ? body.min_score : undefined,
    });
    return Response.json({ ok: true, config: cfg });
  } catch (e: any) {
    console.error("Outreach config error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

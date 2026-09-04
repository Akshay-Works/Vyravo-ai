import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { saveWhatsAppConfig, type WhatsAppConfig } from "@/lib/whatsapp/config";
import { ensureWhatsAppSchema } from "@/lib/whatsapp/pipeline";

export const dynamic = "force-dynamic";

// PUT /api/admin/whatsapp/config — WhatsApp outreach knobs (sending ON/OFF,
// approval, test mode, opt-in gate, daily limit, min delay, max per run,
// follow-up days, min score, campaign id, emergency stop). Admin only.
export async function PUT(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureWhatsAppSchema();
    const body = (await request.json().catch(() => ({}))) as Partial<WhatsAppConfig>;
    const cfg = await saveWhatsAppConfig({
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      approval_required: typeof body.approval_required === "boolean" ? body.approval_required : undefined,
      test_mode: typeof body.test_mode === "boolean" ? body.test_mode : undefined,
      require_opt_in: typeof body.require_opt_in === "boolean" ? body.require_opt_in : undefined,
      daily_limit: typeof body.daily_limit === "number" ? body.daily_limit : undefined,
      min_delay_min: typeof body.min_delay_min === "number" ? body.min_delay_min : undefined,
      max_per_run: typeof body.max_per_run === "number" ? body.max_per_run : undefined,
      follow_up_days: Array.isArray(body.follow_up_days) ? body.follow_up_days.map(Number) : undefined,
      min_score: typeof body.min_score === "number" ? body.min_score : undefined,
      campaign_id: typeof body.campaign_id === "string" ? body.campaign_id : undefined,
      emergency_stop: typeof body.emergency_stop === "boolean" ? body.emergency_stop : undefined,
    });
    return Response.json({ ok: true, config: cfg });
  } catch (e: any) {
    console.error("WhatsApp config error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

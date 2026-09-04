import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getWhatsAppDashboard, ensureWhatsAppSchema } from "@/lib/whatsapp/pipeline";

export const dynamic = "force-dynamic";

// GET /api/admin/whatsapp?status=awaiting_approval&today=1 — WhatsApp outreach
// queue + analytics + config (admin session auth, same as email/LinkedIn).
export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureWhatsAppSchema();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const today = url.searchParams.get("today") === "1";
    return Response.json(await getWhatsAppDashboard({ status, today }));
  } catch (e: any) {
    console.error("WhatsApp outreach dashboard error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

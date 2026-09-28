import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { createProject, listProjects } from "@/lib/brandnest/projects";

export const dynamic = "force-dynamic";

// GET (?leadId=) → projects. POST → record project/payment (ledger only, no automation).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(request.url);
  const leadId = u.searchParams.get("leadId") ? Number(u.searchParams.get("leadId")) : undefined;
  return Response.json({ ok: true, projects: await listProjects(leadId) });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json().catch(() => ({}));
    const r = await createProject({
      leadId: Number(b.leadId), service: b.service, amount: Number(b.amount),
      currency: b.currency, status: b.status, deliveryDate: b.deliveryDate,
      paymentDate: b.paymentDate, paymentMethod: b.paymentMethod, notes: b.notes,
    });
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

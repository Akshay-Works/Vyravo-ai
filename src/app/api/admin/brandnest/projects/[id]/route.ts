import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { updateProject } from "@/lib/brandnest/projects";

export const dynamic = "force-dynamic";

// PATCH /api/admin/brandnest/projects/[id] — update status/amount/dates.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await request.json().catch(() => ({}));
    await updateProject(Number(id), {
      status: b.status, amount: b.amount ?? undefined, deliveryDate: b.deliveryDate,
      paymentDate: b.paymentDate, paymentMethod: b.paymentMethod, notes: b.notes, service: b.service,
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/rbac";
import { getSalesLead, logCall, addLeadNote, salesStageMove, createTask, completeTask } from "@/lib/sales-workspace/ops";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const d = await getSalesLead(auth.user, Number(id));
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, ...d });
}

// PATCH { action: note|stage|call|task|task_done, ... } — scoped, audited, lifecycle-safe.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["sales"]);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  const leadId = Number(id);
  const b = await request.json().catch(() => ({}));
  try {
    switch (String(b.action)) {
      case "note":
        await addLeadNote(auth.user, leadId, String(b.note || ""));
        return Response.json({ ok: true });
      case "stage":
        return Response.json({ ok: true, ...(await salesStageMove(auth.user, leadId, b.to, b.reason)) });
      case "call":
        return Response.json({ ok: true, ...(await logCall(auth.user, leadId, {
          outcome: b.outcome, notes: b.notes, durationSecs: b.durationSecs ?? null, nextFollowUp: b.nextFollowUp || null,
        })) });
      case "task":
        return Response.json({ ok: true, ...(await createTask(auth.user, leadId, {
          kind: b.kind, title: b.title, dueAt: b.dueAt || null, notes: b.notes, assigneeId: b.assigneeId ?? null,
        })) });
      case "task_done":
        await completeTask(auth.user, Number(b.taskId), b.note);
        return Response.json({ ok: true });
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: e?.status || 400 });
  }
}

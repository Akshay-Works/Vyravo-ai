import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { getBrandNestClient, updateBrandNestClient } from "@/lib/brandnest/clients";
import { listProjects } from "@/lib/brandnest/projects";

export const dynamic = "force-dynamic";

// GET → client + aggregates + projects. PATCH → update BrandNest fields.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const client = await getBrandNestClient(Number(id));
  if (!client) return Response.json({ error: "not found" }, { status: 404 });
  const projects = await listProjects(Number(id));
  return Response.json({ ok: true, client, projects });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const b = await request.json().catch(() => ({}));
    await updateBrandNestClient(Number(id), {
      relationshipStatus: b.relationshipStatus, reactivationStatus: b.reactivationStatus,
      vyravoOpportunity: b.vyravoOpportunity, vyravoCategories: b.vyravoCategories,
      repeatValue: b.repeatValue ?? undefined, notes: b.notes,
      nextFollowUp: b.nextFollowUp, services: b.services,
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

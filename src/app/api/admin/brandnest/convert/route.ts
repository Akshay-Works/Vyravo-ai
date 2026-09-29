import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { convertToVyravo } from "@/lib/brandnest/convert";

export const dynamic = "force-dynamic";

// POST { leadId, categories?, opportunity?, note? } — warm conversion, no outreach queued.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json().catch(() => ({}));
    if (!Number(b.leadId)) return Response.json({ error: "leadId required" }, { status: 400 });
    const r = await convertToVyravo(Number(b.leadId), { categories: b.categories, opportunity: b.opportunity, note: b.note });
    let proposalId: number | null = null;
    if (b.draftProposal && !r.already) {
      try {
        const { generateSalesProposal } = await import("@/lib/sales/deals");
        const p = await generateSalesProposal(Number(b.leadId), { notes: "Auto-drafted on BrandNest → Vyravo conversion (warm client)." });
        proposalId = p.proposalId;
      } catch (e: any) {
        return Response.json({ ok: true, ...r, proposalId: null, proposalError: String(e?.message || e).slice(0, 200) });
      }
    }
    return Response.json({ ok: true, ...r, proposalId });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

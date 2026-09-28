import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { upsertBrandNestClient, listBrandNestClients } from "@/lib/brandnest/clients";

export const dynamic = "force-dynamic";

// GET → list (?status=&opportunity=&reactivation=&q=). POST → create/link (deduped, never queues outreach).
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(request.url);
  const clients = await listBrandNestClients({
    status: u.searchParams.get("status") || undefined,
    opportunity: u.searchParams.get("opportunity") || undefined,
    reactivation: u.searchParams.get("reactivation") || undefined,
    q: u.searchParams.get("q") || undefined,
  });
  return Response.json({ ok: true, clients });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json().catch(() => ({}));
    const r = await upsertBrandNestClient({
      name: b.name, company: b.company, email: b.email, phone: b.phone,
      website: b.website, linkedin: b.linkedin, location: b.location,
      acquisitionSource: b.acquisitionSource, relationshipStatus: b.relationshipStatus,
      services: b.services, notes: b.notes, nextFollowUp: b.nextFollowUp,
    });
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

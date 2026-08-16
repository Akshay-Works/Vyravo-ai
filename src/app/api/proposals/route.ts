import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/knowledge-base/rate-limit";
import { listProposals, createProposal } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// GET /api/proposals?search=&status=&limit=&offset=&includeArchived=
export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const data = await listProposals({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      limit: Number(searchParams.get("limit") || "50"),
      offset: Number(searchParams.get("offset") || "0"),
      includeArchived: searchParams.get("includeArchived") === "true",
    });
    return Response.json(data);
  } catch (e) {
    console.error("List proposals error:", e);
    return Response.json({ error: "Failed to list proposals" }, { status: 500 });
  }
}

// POST /api/proposals — create a proposal (manual or from template)
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  { const rl = rateLimit("write", clientIp(request)); if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec); }

  try {
    const body = await request.json();
    const { title } = body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }
    const id = await createProposal({
      title: title.trim(),
      clientName: body.clientName,
      companyName: body.companyName,
      clientEmail: body.clientEmail,
      clientPhone: body.clientPhone,
      clientWebsite: body.clientWebsite,
      industry: body.industry,
      leadId: body.leadId ? Number(body.leadId) : undefined,
      clientId: body.clientId ? Number(body.clientId) : undefined,
      projectDescription: body.projectDescription,
      businessProblems: Array.isArray(body.businessProblems) ? body.businessProblems : undefined,
      goals: Array.isArray(body.goals) ? body.goals : undefined,
      requirements: Array.isArray(body.requirements) ? body.requirements : undefined,
      summary: body.summary,
      templateId: body.templateId,
      templateContent: body.templateContent || null,
      content: body.content || null,
      paymentTerms: body.paymentTerms,
      supportTerms: body.supportTerms,
      expiryDays: body.expiryDays,
      notes: body.notes,
    });
    return Response.json({ success: true, id }, { status: 201 });
  } catch (e) {
    console.error("Create proposal error:", e);
    return Response.json({ error: "Failed to create proposal" }, { status: 500 });
  }
}

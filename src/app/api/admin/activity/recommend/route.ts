import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { recommendFocus } from "@/lib/activity/tier3";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await recommendFocus());
  } catch (e: any) {
    console.error("Tier3 recommend error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

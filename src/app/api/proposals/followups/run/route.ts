import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { runFollowUps } from "@/lib/proposals/followups";
import { expireOverdueProposals } from "@/lib/proposals/engine";

export const dynamic = "force-dynamic";

// POST /api/proposals/followups/run — process follow-up sequence + expire overdue
export async function POST(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [followUpsSent, expired] = await Promise.all([
      runFollowUps(),
      expireOverdueProposals(),
    ]);
    return Response.json({ success: true, followUpsSent, expired });
  } catch (e) {
    console.error("Follow-up run error:", e);
    return Response.json({ error: "Follow-up run failed" }, { status: 500 });
  }
}

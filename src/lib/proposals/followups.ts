// Follow-up automation for sent proposals.
//
// Sequence: sent → wait 2d → follow-up 1 → wait 3d → follow-up 2 →
// wait 5d → final follow-up. Stops on accepted / rejected / expired /
// changes_requested / archived.

import { and, lt, sql } from "drizzle-orm";
import { pool, db } from "@/db";
import { proposals } from "@/db/proposal-schema";
import { buildProposalEmailPayload, sendProposalEmail } from "./email";
import { recordEvent } from "./engine";

export const FOLLOW_UP_SCHEDULE = [
  { stage: 1, label: "Follow-up 1", afterDays: 2, emailType: "proposal_followup_1" },
  { stage: 2, label: "Follow-up 2", afterDays: 3, emailType: "proposal_followup_2" },
  { stage: 3, label: "Final follow-up", afterDays: 5, emailType: "proposal_followup_final" },
];

export async function runFollowUps(now = new Date()): Promise<number> {
  const res = await pool.query(
    `SELECT * FROM proposals
     WHERE status IN ('sent','viewed')
       AND archived_at IS NULL
       AND sent_at IS NOT NULL
       AND follow_up_stage < 3`
  );
  const rows = res.rows as any[];
  let sent = 0;

  for (const p of rows) {
    const stage = Number(p.follow_up_stage || 0);
    const step = FOLLOW_UP_SCHEDULE[stage];
    if (!step) continue;

    const sentAt = new Date(p.sent_at);
    const elapsedDays = (now.getTime() - sentAt.getTime()) / 86_400_000;
    if (elapsedDays < step.afterDays) continue;

    // Stop conditions
    const stop = ["accepted", "rejected", "expired", "changes_requested", "archived"];
    if (stop.includes(p.status)) {
      await db.update(proposals).set({ followUpStage: 3 }).where(sql`id = ${p.id}`);
      continue;
    }

    try {
      const payload = buildProposalEmailPayload(p, step.emailType);
      await sendProposalEmail(payload);
      await recordEvent(Number(p.id), "follow_up", { stage: stage + 1, label: step.label });
      await db
        .update(proposals)
        .set({ followUpStage: stage + 1, lastActivityAt: new Date() })
        .where(sql`id = ${p.id}`);
      sent++;
    } catch (e) {
      console.error(`Follow-up ${step.label} failed for proposal ${p.id}:`, e);
    }
  }
  return sent;
}

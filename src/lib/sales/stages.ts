// ============================================================================
// SALES OS — canonical pipeline (§16). Every lead has exactly one stage.
// Active stages move forward; any stage can move to a terminal stage.
// Unknown legacy values are treated as 'new' (never crash, never stuck).
// ============================================================================
import { pool } from "@/db";
import { logDecision } from "./schema";

export const ACTIVE_STAGES = [
  "new", "researched", "contacted", "engaged", "qualified", "meeting_booked",
  "discovery_completed", "proposal_sent", "negotiation", "verbal_agreement", "won", "onboarding",
] as const;

export const TERMINAL_STAGES = [
  "not_interested", "wrong_contact", "unqualified", "lost", "no_response", "nurture",
] as const;

export const ALL_STAGES = [...ACTIVE_STAGES, ...TERMINAL_STAGES] as const;
export type SalesStage = (typeof ALL_STAGES)[number];

const ORDER = new Map<string, number>(ACTIVE_STAGES.map((s, i) => [s, i]));

/** Legacy CRM values → canonical stages. Never regress automation state. */
const LEGACY_MAP: Record<string, string> = {
  ready_for_outreach: "researched",
  archived: "lost", // archived = dead in legacy CRM → terminal, automation stops
};

export function normalizeStage(raw: any): string {
  const s = String(raw || "new").toLowerCase().trim();
  if ((ALL_STAGES as readonly string[]).includes(s)) return s;
  return LEGACY_MAP[s] || "new";
}

export function isTerminal(stage: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

/** Pure transition rule — fully unit-testable. */
export function canTransition(fromRaw: any, toRaw: any): boolean {
  const from = normalizeStage(fromRaw);
  const to = String(toRaw || "").toLowerCase().trim();
  if (!(ALL_STAGES as readonly string[]).includes(to)) return false;
  if (from === to) return true;
  if (isTerminal(to)) return true; // any → terminal always allowed
  if (isTerminal(from)) return false; // terminal is sticky (admin force to revive)
  return (ORDER.get(to) ?? -1) >= (ORDER.get(from) ?? 0);
}

export async function advanceStage(
  leadId: number, to: string, reason: string,
  opts: { actor?: string; force?: boolean; trigger?: string } = {}
): Promise<{ moved: boolean; from: string; to: string }> {
  const cur = await pool.query(`SELECT stage FROM leads WHERE id = $1`, [leadId]);
  const from = normalizeStage(cur.rows[0]?.stage);
  const dest = String(to || "").toLowerCase().trim();
  if (!canTransition(from, dest) && !opts.force) {
    await logDecision({
      lead_id: leadId, trigger_text: opts.trigger || "advanceStage", from_stage: from, to_stage: dest,
      action: "stage_blocked", autonomy: "L1", reason: `illegal transition blocked: ${reason}`.slice(0, 300),
      status: "blocked",
    });
    return { moved: false, from, to: from };
  }
  if (from === dest) return { moved: false, from, to: from };
  await pool.query(`UPDATE leads SET stage = $2 WHERE id = $1`, [leadId, dest]);
  await pool.query(
    `INSERT INTO activities (type, action, description, lead_id, created_at)
     VALUES ('lead','stage_changed',$2,$1,now())`,
    [leadId, `Stage: ${from} → ${dest} — ${reason}`.slice(0, 300)]).catch(() => {});
  await logDecision({
    lead_id: leadId, trigger_text: opts.trigger || "advanceStage", from_stage: from, to_stage: dest,
    action: "stage_move", autonomy: opts.actor === "admin" ? "none" : "L1",
    reason: reason.slice(0, 300), context: { actor: opts.actor || "system" }, result: "moved",
  });
  return { moved: true, from, to: dest };
}

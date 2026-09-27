// ============================================================================
// SALES OS — canonical reply-intent taxonomy. Maps the deterministic Tier-0
// class + the LLM inbox classification onto ONE sales intent with its
// pipeline consequence. Pure functions (no DB) — the engine decides.
// ============================================================================

export type SalesIntent =
  | "INTERESTED" | "VERY_INTERESTED" | "QUESTION" | "PRICING"
  | "MEETING_REQUEST" | "REFERRAL" | "INTRODUCTION" | "NOT_INTERESTED"
  | "NOT_NOW" | "UNSUBSCRIBE" | "WRONG_PERSON" | "OBJECTION"
  | "NEEDS_MORE_INFO" | "OUT_OF_OFFICE" | "GENERAL" | "HUMAN_REVIEW";

export interface IntentRoute {
  intent: SalesIntent;
  /** Stage move the engine should attempt (null = none). */
  stageMove: string | null;
  /** Whether the founder must be looped in. */
  escalate: string | null;
  note: string;
}

/**
 * tier0: deterministic class from @/lib/activity/classify (or null).
 * llmClass: inbox LLM classification (or null). conf: 0..1 (0 when unknown).
 */
export function toSalesIntent(tier0: string | null, llmClass: string | null, conf: number): IntentRoute {
  const t0 = String(tier0 || "").toLowerCase();
  const lc = String(llmClass || "").toLowerCase();
  const c = Number(conf || 0);

  // Deterministic terminal classes always win (zero-cost, already proven).
  if (t0 === "unsubscribe" || lc === "unsubscribe")
    return { intent: "UNSUBSCRIBE", stageMove: null, escalate: null, note: "opt-out → UNSUBSCRIBED event + suppression" };
  if (t0 === "not_interested" || lc === "not_interested")
    return { intent: "NOT_INTERESTED", stageMove: "not_interested", escalate: null, note: "declined → stop sequence" };
  if (t0 === "out_of_office" || lc === "out_of_office")
    return { intent: "OUT_OF_OFFICE", stageMove: null, escalate: null, note: "OOO → retry later, no stage move" };
  if (lc === "wrong_person" || lc === "wrong_contact")
    return { intent: "WRONG_PERSON", stageMove: "wrong_contact", escalate: null, note: "wrong contact → terminal" };

  // LLM high-signal classes.
  if (lc === "meeting_request")
    return c >= 0.75
      ? { intent: "MEETING_REQUEST", stageMove: "replied", escalate: "meeting_request", note: "meeting intent → calendar link + founder nudge" }
      : { intent: "HUMAN_REVIEW", stageMove: "replied", escalate: "low_confidence", note: "uncertain meeting intent → human review" };
  if (lc === "pricing_request" || lc === "pricing")
    return { intent: "PRICING", stageMove: "replied", escalate: "pricing", note: "pricing question → founder answers (never invent)" };
  if (lc === "referral")
    return { intent: "REFERRAL", stageMove: "replied", escalate: null, note: "referral → extract + spawn linked lead" };
  if (lc === "introduction" || lc === "introduction_request")
    return { intent: "INTRODUCTION", stageMove: "replied", escalate: null, note: "warm intro path" };
  if (lc === "objection" || lc === "negotiation")
    return { intent: "OBJECTION", stageMove: null, escalate: "negotiation", note: "objection → negotiation analysis" };
  if (lc === "agreement" || lc === "verbal_agreement" || lc === "proceed")
    return { intent: "VERY_INTERESTED", stageMove: null, escalate: "agreement_check", note: "possible agreement → high-confidence check" };

  // Tier-0 engagement classes.
  if (t0 === "positive")
    return { intent: "INTERESTED", stageMove: "replied", escalate: null, note: "positive reply → engaged loop" };
  if (t0 === "interested_followup")
    return { intent: "NEEDS_MORE_INFO", stageMove: "replied", escalate: null, note: "nurture-style follow-up" };
  if (t0 === "question" || lc === "question")
    return { intent: "QUESTION", stageMove: "replied", escalate: null, note: "question → AI answers, stays in loop" };
  if (lc === "positive_interest" || lc === "positive" || lc === "interested")
    return { intent: "INTERESTED", stageMove: "replied", escalate: null, note: "positive reply → engaged loop" };
  if (lc === "not_now" || lc === "defer" || lc === "followup_later")
    return { intent: "NOT_NOW", stageMove: null, escalate: null, note: "timing defer → nurture scheduling" };

  if (c > 0 && c < 0.4)
    return { intent: "HUMAN_REVIEW", stageMove: "replied", escalate: "low_confidence", note: "low confidence → human review" };
  return { intent: "GENERAL", stageMove: "replied", escalate: null, note: "general reply → engaged loop" };
}

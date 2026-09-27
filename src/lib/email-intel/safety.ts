// ============================================================================
// EMAIL INTELLIGENCE — deterministic safety router. Pure function: the LLM
// proposes, THIS disposes. No I/O, fully testable. Confidence tiers:
//   >= min_conf (0.90) + clean  → auto-send eligible
//   review_at..min_conf (0.75+)  → draft stored, flagged for review
//   < review_at                  → human review required
// Hard safety outcomes never reach the LLM at all (handled pre-LLM).
// ============================================================================
import type { IntelAnalysis, IntelEntity } from "./llm";
import type { ReplyClass } from "@/lib/activity/classify";

export type IntelAction =
  | "send"          // auto-send reply (+ referral emails) now
  | "draft"         // store draft, flag for review (medium confidence)
  | "needs_review"  // human must triage (low confidence / flags / no LLM)
  | "ignore"        // nothing to do (ooo, spam, …)
  | "no_reply"      // log + stop chain, but send nothing (not interested)
  | "unsubscribe";  // DNC + cancel chains, NEVER reply

export interface SafetyContext {
  tier0: ReplyClass;                 // deterministic pre-classification
  llm: IntelAnalysis | null;         // null = unavailable/failed
  autoReplyOn: boolean;              // master gate (config)
  threadAutoOn: boolean;             // per-thread pref
  sentToday: number;                 // auto-replies already sent today
  dailyCap: number;
  threadAutoSent7d: number;          // auto-replies in this thread, 7d
  minConf: number;                   // default 0.90
  reviewAt: number;                  // default 0.75
  recipientKnown: boolean;           // we know who we'd reply to
  isSelf: boolean;                   // from our own address
}

export interface SafetyDecision {
  action: IntelAction;
  reasons: string[];
  contacts: { entity: IntelEntity; action: "contact" | "review" | "ignore" }[];
}

const TERMINAL_NO_REPLY: ReplyClass[] = ["not_interested"];

export function decideAction(c: SafetyContext): SafetyDecision {
  const reasons: string[] = [];
  const contacts: SafetyDecision["contacts"] = [];

  // ---- hard gates (no judgment calls) ----
  if (c.isSelf) return { action: "ignore", reasons: ["own address — loop guard"], contacts };
  if (!c.recipientKnown) return { action: "needs_review", reasons: ["recipient unclear"], contacts };
  if (c.tier0 === "unsubscribe") return { action: "unsubscribe", reasons: ["unsubscribe intent (deterministic)"], contacts };
  if (c.tier0 === "out_of_office") return { action: "ignore", reasons: ["out-of-office — no reply"], contacts };
  if (TERMINAL_NO_REPLY.includes(c.tier0)) return { action: "no_reply", reasons: ["not interested — stop chain, send nothing"], contacts };

  // ---- LLM unavailable → human, never guess ----
  const llm = c.llm;
  if (!llm) return { action: "needs_review", reasons: ["AI unavailable — human review"], contacts };

  // ---- LLM safety outcomes (belt + suspenders over tier-0) ----
  if (llm.classification === "unsubscribe") return { action: "unsubscribe", reasons: ["unsubscribe intent (AI)"], contacts };
  if (llm.classification === "out_of_office" || llm.classification === "spam")
    return { action: "ignore", reasons: [`${llm.classification} — no reply`], contacts };
  if (llm.classification === "not_interested")
    return { action: "no_reply", reasons: ["not interested (AI) — stop chain, send nothing"], contacts };
  if (llm.classification === "requires_human_review" || llm.safety_flags.length > 0)
    return { action: "needs_review", reasons: [`safety: ${(llm.safety_flags.join(", ") || llm.classification)}`], contacts };
  if (!llm.reply_required) return { action: "ignore", reasons: ["no response required"], contacts };

  // ---- referral contacts: each entity judged independently ----
  for (const e of llm.entities) {
    if (e.recommended_action === "ignore" || e.confidence < c.reviewAt) {
      contacts.push({ entity: e, action: "ignore" });
    } else if (e.recommended_action === "contact" && e.confidence >= c.minConf) {
      contacts.push({ entity: e, action: "contact" });
    } else {
      contacts.push({ entity: e, action: "review" });
    }
  }

  // ---- confidence tiers for the reply itself ----
  if (llm.confidence < c.reviewAt || !llm.draft)
    return { action: "needs_review", reasons: [`confidence ${llm.confidence.toFixed(2)} < ${c.reviewAt}`], contacts };
  if (llm.confidence < c.minConf)
    return { action: "draft", reasons: [`confidence ${llm.confidence.toFixed(2)} — draft for review`], contacts };

  // ---- auto-send gates ----
  if (!c.autoReplyOn) { reasons.push("master auto-reply gate OFF"); return { action: "draft", reasons, contacts }; }
  if (!c.threadAutoOn) { reasons.push("thread auto-reply disabled"); return { action: "draft", reasons, contacts }; }
  if (c.sentToday >= c.dailyCap) { reasons.push(`daily cap reached (${c.dailyCap})`); return { action: "draft", reasons, contacts }; }
  if (c.threadAutoSent7d >= 5) { reasons.push("thread auto-reply cap (5/7d)"); return { action: "draft", reasons, contacts }; }

  reasons.push(`confidence ${llm.confidence.toFixed(2)} — auto-send`);
  return { action: "send", reasons, contacts };
}

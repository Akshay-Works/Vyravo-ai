// ============================================================================
// Deterministic reply classifier (Tier 2). Ordered rules over the decoded
// reply text — NO LLM, NO guessing: anything uncertain is "unknown".
// Decoding matters: stored previews are sometimes raw MIME or truncated
// base64, so we normalize (strip MIME/HTML, base64-decode when valid)
// before matching. Pure function — no DB, no side effects.
// ============================================================================

export type ReplyClass =
  | "positive" | "interested_followup" | "question" | "neutral"
  | "not_interested" | "unsubscribe" | "out_of_office" | "unknown";

export const REPLY_CLASS_LABELS: Record<ReplyClass, string> = {
  positive: "Positive / Interested",
  interested_followup: "Interested — needs follow-up",
  question: "Question",
  neutral: "Neutral",
  not_interested: "Not interested",
  unsubscribe: "Unsubscribe",
  out_of_office: "Out of office",
  unknown: "Unknown",
};

/** Strip MIME wrappers/HTML; base64-decode when the blob is validly encoded. */
/** Base64-decode one part when it is cleanly encoded AND decodes to sane text. */
function decodePart(s: string): string {
  const blob = s.replace(/\s+/g, "");
  if (blob.length < 60 || !/^[A-Za-z0-9+/=]+$/.test(blob)) return s;
  try {
    const dec = Buffer.from(blob, "base64").toString("utf8");
    const printable = (dec.match(/[ -~\n\r\t]/g) || []).length;
    if (dec.length >= 15 && printable / Math.max(1, dec.length) >= 0.8 && /\s/.test(dec)) return dec;
  } catch { /* not decodable — use raw text */ }
  return s;
}

export function normalizeReplyText(subject: string | null, preview: string | null): string {
  // decode the preview ALONE (subject punctuation would poison the check)
  let t = `${subject || ""}\n${decodePart(preview || "")}`;
  t = t.replace(/--[A-Za-z0-9_='+./-]{5,}/g, " ");                 // MIME boundary tokens (token only — previews are single-line)
  t = t.replace(/Content-(Type|Transfer-Encoding|Disposition):/gi, " ");
  t = t.replace(/charset\s*=\s*"?[A-Za-z0-9_-]+"?/gi, " ");
  return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

const R = {
  unsubscribe: /unsubscrib|opt[\s-]?out|remove me|stop (emailing|mailing|contacting)|do not (email|mail|contact) me|no more emails|take me off|stop spamming/i,
  ooo: /out of (the )?office|out of station|automatic reply|auto[\s-]?repl|on (annual |sick )?leave|currently (away|out of|on vacation)|vacation (response|notice)|will (respond|reply|get back).*return|back in (the )?office|parental leave/i,
  notInterested: /not interested|no thanks|no thank you|don't (contact|email|call|bother)|do not (contact|call|bother)|not (for us|a (good )?fit|relevant|looking|needed|a priority)|already (have|use|using|working with)|we('re| are) (all set|good|sorted|covered)|go away|leave (me|us) alone|not at this time|no budget|can'?t afford/i,
  followup: /\bmore info\b|send (me )?(more|some|further) (info|information|details)|tell me more|keep me (posted|informed|in the loop)|follow up (with me )?(later|next (week|month|quarter))|reach out (later|in a|next)|circle back|remind me/i,
  positive: /interested|let'?s (talk|meet|connect|schedule|set up|discuss|hop on)|sounds (good|great|interesting|perfect)|looks (good|great|interesting)|call me|book a (call|meeting|demo)|schedule a (call|meeting|demo)|set up a (call|meeting)|i'?d like to (know more|learn more|hear more|discuss|schedule)|when (can|are|would) you (be )?available|are you (available|free)|send (a |me )?(proposal|quote|quotation|pricing|deck)|share .*proposal|how much|what do you charge|what'?s the (price|cost|pricing)|drop me a whatsapp|message me on whatsapp|about the deal|let'?s do it|we'?re in|sign ?up/i,
  neutral: /^.{0,50}\b(thank|thanks|noted|ok\b|okay|acknowledged|received|noted with thanks)\b/i,
};

export function classifyReply(subject: string | null, preview: string | null): { class: ReplyClass; rule: string } {
  const text = normalizeReplyText(subject, preview);
  if (!text || text.length < 3) return { class: "unknown", rule: "empty" };
  if (R.unsubscribe.test(text)) return { class: "unsubscribe", rule: "unsubscribe" };
  if (R.ooo.test(text)) return { class: "out_of_office", rule: "ooo" };
  if (R.notInterested.test(text)) return { class: "not_interested", rule: "not_interested" };
  if (R.followup.test(text)) return { class: "interested_followup", rule: "followup" };
  if (R.positive.test(text)) return { class: "positive", rule: "positive" };
  if (text.includes("?")) return { class: "question", rule: "interrogative" };
  if (R.neutral.test(text)) return { class: "neutral", rule: "neutral" };
  return { class: "unknown", rule: "no_match" };
}

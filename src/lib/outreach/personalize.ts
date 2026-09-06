// ============================================================================
// PERSONALIZE — per-lead personal points built ONLY from real, verified data.
//   point1 → the lead's own stated biggest challenge (discovery notes)
//   point2 → an observation from the lead's OWN public website signals
// No invented facts, and internal scoring language is never exposed. Pure
// functions (no DB) so they are trivially testable.
// ============================================================================

export interface Points {
  point1: string | null;
  point2: string | null;
}

// Internal/CRM wording that must never reach a prospect:
const INTERNAL_MARKERS =
  /(scored\s+\d|next:\s*send|auto-discovered|automation-scored|documented fit|prepare(d)? angle|priority:)/i;

const clean = (s: unknown, max = 220): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
};

const signalsOf = (lead: any): Record<string, any> | null =>
  lead?.signals && typeof lead.signals === "object" ? lead.signals : null;

/** POINT 1 — the lead's own stated biggest challenge (real, per-lead). */
export function pointBiggestChallenge(lead: any): string | null {
  const s = clean(lead?.biggest_challenge ?? lead?.biggestChallenge);
  if (!s || !/[A-Za-z]{4,}/.test(s) || INTERNAL_MARKERS.test(s)) return null;
  return s;
}

/** POINT 2 — observation from the lead's own public website signals. */
export function pointWebsiteSignals(lead: any): string | null {
  const sig = signalsOf(lead);
  if (!sig) return null;
  const noChat = sig.has_chatbot === false;
  const booking = sig.has_booking === true;
  const wa = sig.has_whatsapp === true;
  const form = sig.has_lead_form === true;
  const phoneOnly = sig.has_phone === true && sig.has_email === false && sig.has_lead_form === false;
  if (noChat && booking)
    return "on your site I saw online booking, but questions that don't come with a booked slot still wait for a human to reply";
  if (noChat && form)
    return "on your site I saw an enquiry form, but there's no instant answer until someone opens it";
  if (noChat && wa)
    return "you publish a WhatsApp number, but replies still depend on someone being at the phone";
  if (noChat)
    return "on your site I couldn't find a live chat or instant-reply path, so after-hours enquiries can sit until morning";
  if (phoneOnly)
    return "your site leads with a phone number — the quickest enquiries can't be answered outside working hours";
  return null;
}

/** Full personalization for a lead. point2 carries its own prefix or is "".
 *  Never both empty: point1 falls back to an honest question in the caller. */
export function personalPoints(lead: any): Points {
  return {
    point1: pointBiggestChallenge(lead),
    point2: pointWebsiteSignals(lead),
  };
}

/** The honest fallback question — used only when no verifiable point exists. */
export const GENERIC_POINT =
  "I'd love to learn where manual work slows your team down most";

/** Build the final point1 string for templates (question fallback). */
export function resolvePoint1(lead: any): string {
  return pointBiggestChallenge(lead) || GENERIC_POINT;
}

/** Build the final point2 string ("" when absent — callers drop the paragraph). */
export function resolvePoint2(lead: any): string {
  const p = pointWebsiteSignals(lead);
  if (!p) return "";
  return p.charAt(0).toUpperCase() + p.slice(1) + ".";
}

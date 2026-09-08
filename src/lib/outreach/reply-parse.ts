// ============================================================================
// REPLY PARSING — pure helpers for inbound email matching. No I/O, no deps.
// Gmail/IMAP reply messages carry the original Message-ID in the
// In-Reply-To / References headers. We normalise (strip <>, whitespace, case)
// and match them against the Message-IDs we stored when SENDING.
// ============================================================================

/** "<CAB123+abc@mail.gmail.com>" / "CAB123@mail.gmail.com" -> "cab123@mail.gmail.com" */
export function normalizeMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const bracketed = raw.match(/<([^<>]+)>/);
  const candidate = (bracketed ? bracketed[1] : raw.trim());
  if (!candidate || !candidate.includes("@") || /\s/.test(candidate)) return null;
  return candidate.toLowerCase();
}

/** All message-ids mentioned in In-Reply-To + References (may be space-separated). */
export function extractReplyMessageIds(headers: Record<string, string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const key of ["in-reply-to", "references"]) {
    const v = headers?.[key];
    if (!v) continue;
    // IDs may appear as <a>, <b> ... and/or bare tokens
    for (const m of String(v).matchAll(/<([^<>]+)>/g)) {
      const n = normalizeMessageId(m[0]);
      if (n) out.add(n);
    }
    for (const token of String(v).split(/\s+/)) {
      const n = normalizeMessageId(token);
      if (n) out.add(n);
    }
  }
  return [...out];
}

/** "Name <user@host>" or "user@host" -> bare email (lowercased, trimmed). */
export function extractFromEmail(fromHeader: unknown): string | null {
  if (typeof fromHeader !== "string") return null;
  const m = String(fromHeader).match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (m) return m[1].toLowerCase();
  const bare = String(fromHeader).trim().match(/^[^\s@]+@[^\s@]+$/);
  return bare ? bare[0].toLowerCase() : null;
}

/** Rough text preview from a raw RFC822 source (strips HTML, collapses space). */
export function extractTextPreview(rawSource: string, maxLen = 280): string {
  const body = rawSource.replace(/^[\s\S]*?\r?\n\r?\n/, "");
  const text = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/=\r?\n/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLen);
}

/** A reply is "threaded" when it references at least one id (true reply, not a new mail). */
export function isThreadedReply(headers: Record<string, string | null | undefined>): boolean {
  return extractReplyMessageIds(headers).length > 0;
}

/** Case-insensitive subject test for reply chains ("re:", "aw:", "sv:" etc.). */
export function isReplySubject(subject: unknown): boolean {
  return typeof subject === "string" && /^\s*(re|fwd?|aw|sv|antwort|回复):/i.test(subject);
}

export const REPLY_WINDOW_DAYS = 3; // how far back the IMAP poll scans

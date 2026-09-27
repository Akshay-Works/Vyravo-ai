// ============================================================================
// EMAIL INTELLIGENCE — pure extraction helpers. No I/O, no LLM, no side
// effects. Deterministic pre-pass; the LLM refines (names, relationships,
// recommended actions) but these regexes guarantee nothing is missed.
// ============================================================================

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}/g;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s<>"']+/gi;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/** Addresses that must never become contacts (our own + list plumbing). */
export function isSystemAddress(email: string): boolean {
  const e = email.toLowerCase();
  const ours = [process.env.ADMIN_REPLY_TO, process.env.EMAIL_USER, process.env.GMAIL_IMAP_USER,
    "akshay.navale.work@gmail.com", "onboarding@resend.dev"]
    .filter(Boolean).map((s) => String(s).toLowerCase());
  if (ours.includes(e)) return true;
  return /^(mailer-daemon|postmaster|no-?reply|donotreply|unsubscribe|bounce|mail-delivery)/i.test(e);
}

/** All unique email addresses in text (lowercased), system addresses removed. */
export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || "").match(EMAIL_RE) || []) {
    const e = m.toLowerCase();
    if (!isSystemAddress(e)) out.add(e);
  }
  return [...out];
}

/** Phone-looking numbers (loose; LLM/dedupe decides relevance). */
export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text || "").match(PHONE_RE) || []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) out.add(m.trim());
  }
  return [...out].slice(0, 5);
}

export function extractLinkedIns(text: string): string[] {
  return [...new Set((String(text || "").match(LINKEDIN_RE) || []).map((s) => s.trim()))].slice(0, 5);
}

export function extractUrls(text: string): string[] {
  return [...new Set((String(text || "").match(URL_RE) || []).map((s) => s.trim()))].slice(0, 8);
}

/** Thread root: first References id, else In-Reply-To, else the message itself. */
export function threadRoot(threadIds: string[], ownId: string): string {
  return threadIds[0] || ownId;
}

/**
 * Full readable text from a raw RFC822 source (for LLM + thread view).
 * Decodes base64 parts, strips HTML/quoted replies minimally, caps length.
 */
export function extractFullText(rawSource: string, maxLen = 6000): string {
  let body = String(rawSource || "").replace(/^[\s\S]*?\r?\n\r?\n/, "");
  // decode base64-looking MIME parts in place
  body = body.replace(/[A-Za-z0-9+/=\s]{120,}/g, (blob) => {
    const clean = blob.replace(/\s+/g, "");
    if (clean.length < 120 || !/^[A-Za-z0-9+/=]+$/.test(clean)) return blob;
    try {
      const dec = Buffer.from(clean, "base64").toString("utf8");
      const printable = (dec.match(/[ -~\n\r\t]/g) || []).length;
      if (dec.length >= 20 && printable / Math.max(1, dec.length) >= 0.8 && /\s/.test(dec)) return dec;
    } catch { /* keep original */ }
    return blob;
  });
  const text = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/--[A-Za-z0-9_='+./-]{5,}/g, " ")
    .replace(/Content-(Type|Transfer-Encoding|Disposition):[^\n]*/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/=\r?\n/g, "")
    .replace(/\s+/g, " ").trim();
  return text.slice(0, maxLen);
}

/** "Rohan Sharma <rohan@example.com>" -> { name, email }. */
export function splitAddr(header: string): { name: string | null; email: string | null } {
  const h = String(header || "").trim();
  const m = h.match(/^\s*"?([^"<>,]+)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].toLowerCase() };
  const bare = h.match(/[^<>\s,;]+@[^<>\s,;]+/);
  return { name: null, email: bare ? bare[0].toLowerCase() : null };
}

/** Parse a To/Cc header into bare emails (lowercased). */
export function splitAddrList(header: string): string[] {
  return String(header || "").split(/[,;]/).map((p) => splitAddr(p).email).filter(Boolean) as string[];
}

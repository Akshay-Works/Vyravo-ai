// ============================================================================
// WHATSAPP PHONE NORMALIZATION + VALIDATION
// ----------------------------------------------------------------------------
// Real CRM phone fields are messy ("(+91) 020-25675601/03", "+ 912233503350",
// "(022 30610555 )", landlines, multiple numbers in one field). This module:
//   1. splits the raw value into candidate numbers,
//   2. prefers the number that looks like an Indian mobile (or any mobile),
//   3. normalizes to international format (+<cc><national>),
//   4. validates format only — true WhatsApp membership is decided by the
//      official Meta API (and policy) at send time, never assumed here.
// The recipient is ALWAYS the CRM lead's own phone — never hardcoded.
// ============================================================================

export interface NormalizedPhone {
  raw: string;
  number: string;        // international, no spaces: +919075707650
  country_code: string;  // "91"
  national: string;      // "9075707650"
  valid: boolean;
  reason?: string;       // why invalid, when applicable
}

const INDIA_CC = "91";
/** Country hints for numbers stored without a country code (e.g. bare 10-digit Indian mobiles). */
const COUNTRY_CC: Record<string, string> = {
  india: "91", "united kingdom": "44", uk: "44", "united states": "1", usa: "1",
  australia: "61", "uae": "971", "united arab emirates": "971", singapore: "65",
  canada: "1", "new zealand": "64", germany: "49", france: "33", italy: "39",
  spain: "34", brazil: "55", japan: "81", "south africa": "27", pakistan: "92",
  bangladesh: "880", sri_lanka: "94", nepal: "977", malaysia: "60",
};
const POSSIBLE_CC = ["91", "44", "1", "61", "65", "971", "966", "974", "973", "972", "971", "852", "81", "49", "33", "39", "34", "351", "31", "32", "7", "55", "52", "234", "27", "92", "880", "94", "977", "60", "66", "63", "62", "84", "856", "959", "855", "673"];

/** Split a raw field into candidate digit-strings. */
function candidates(raw: string): string[] {
  const out: string[] = [];
  // split on separators that usually separate two numbers: / , ; | "
  const tokens = String(raw || "").split(/[/,;|"’]+/);
  for (const tok of tokens) {
    const digits = tok.replace(/[^\d]/g, "");
    if (digits.length >= 8) out.push(digits);
  }
  if (!out.length) {
    const all = String(raw || "").replace(/[^\d]/g, "");
    if (all.length >= 8) out.push(all);
  }
  return out;
}

/** Does this digit-string look like an Indian mobile (10d starting 6-9, with or without 91/0 prefix)? */
function looksLikeIndianMobile(d: string): boolean {
  const s = d.replace(/^0+/, "");
  if (s.length === 10) return /^[6-9]/.test(s);
  if (s.length === 12 && s.startsWith(INDIA_CC)) return /^[6-9]/.test(s.slice(2));
  return false;
}

/** Score how likely a candidate is a WhatsApp-capable mobile. */
function scoreCandidate(d: string): number {
  let score = 0;
  if (looksLikeIndianMobile(d)) score += 100;
  const s = d.replace(/^0+/, "");
  if (s.startsWith(INDIA_CC) && s.length === 12) score += 30;
  if (/^[6-9]/.test(s) && s.length === 10) score += 20;
  if (/^\+?1[2-9]\d{9}$/.test(d)) score += 20;         // US
  if (/^[0-9]{9,14}$/.test(d)) score += 5;             // generic long number
  if (/^(0|\+?9)?[12]\d{7,10}$/.test(s)) score -= 30;  // landline-ish (starts 0/1/2)
  return score;
}

/**
 * Normalize + validate a lead's phone into international format.
 * Preferences (in order): a candidate that looks like an Indian mobile,
 * then any candidate with a recognizable country code, then longest.
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined, countryHint?: string | null): NormalizedPhone {
  const r = String(raw || "").trim();
  if (!r) return { raw: r, number: "", country_code: "", national: "", valid: false, reason: "no phone number on record" };

  let cands = candidates(r);
  if (!cands.length) return { raw: r, number: "", country_code: "", national: "", valid: false, reason: "no usable digits in phone" };
  cands = cands.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  let best = cands[0];
  // strip leading 00 (international prefix) or single leading 0 (national)
  let s = best.replace(/^00/, "");
  s = s.replace(/^0/, "");
  // detect country code
  let cc = "";
  let national = s;
  for (const p of POSSIBLE_CC.sort((a, b) => b.length - a.length)) {
    if (s.startsWith(p) && s.length - p.length >= 7 && s.length - p.length <= 12) {
      cc = p;
      national = s.slice(p.length);
      break;
    }
  }
  // heuristics for Indian numbers stored without +91
  if (!cc && looksLikeIndianMobile(s)) { cc = INDIA_CC; national = s.replace(/^0+/, ""); }
  if (!cc && s.length === 12 && s.startsWith(INDIA_CC)) { cc = INDIA_CC; national = s.slice(2); }
  // fall back: leading 0 was national, then 10-digit mobile w/o CC
  if (!cc && s.length === 10 && /^[6-9]/.test(s)) { cc = INDIA_CC; national = s; }
  // country hint (CRM country field) — used ONLY when the number itself
  // carries no country code, so a stored "+44…" is never re-attributed.
  if (!cc && countryHint) {
    const hint = COUNTRY_CC[String(countryHint).trim().toLowerCase()];
    if (hint && s.length >= 8 && s.length <= 12) { cc = hint; national = s; }
  }
  if (!cc) {
    return { raw: r, number: "", country_code: "", national: "", valid: false, reason: "could not determine country code" };
  }
  national = national.replace(/^0+/, "");
  const number = "+" + cc + national;
  const valid = /^\+[1-9]\d{1,3}\d{6,11}$/.test(number) && national.length >= 6 && national.length <= 11;
  return {
    raw: r,
    number: valid ? number : "",
    country_code: cc,
    national,
    valid,
    reason: valid ? undefined : "number length outside 6–11 national digits",
  };
}

/** Quick format check for a value that is already supposed to be normalized. */
export function isValidWhatsAppNumber(number: string): boolean {
  return /^\+[1-9]\d{1,3}\d{6,11}$/.test(number);
}

/** Mask a phone for display: +91*******650 */
export function maskWhatsAppNumber(number: string): string {
  if (!number) return "";
  if (number.length < 8) return "***";
  return number.slice(0, 4) + "*".repeat(Math.max(3, number.length - 8)) + number.slice(-3);
}

// ============================================================================
// PREMIUM OUTREACH EMAIL SHELL — brand-grade rendering for automated emails.
// Inline styles only (Gmail/Outlook-safe), no external assets, no images.
// The editable copy in `email_templates` is the INNER content; this shell
// provides the document, brand lockup, signature and compliance footer.
// ============================================================================

export interface ShellOpts {
  subject: string;
  preheader: string;
  innerHtml: string;
  industry?: string | null;
  hasCta?: boolean;
}

const BRAND = "#3B82F6";
const INK = "#17233D";
const MUTED = "#5A6B87";
const FAINT = "#98A2B3";
const LINE = "#E7EBF3";
const BG = "#F4F6FB";

function brandRow(): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:26px;">` +
    `<tr>` +
    `<td style="font:700 20px/1 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};letter-spacing:-0.2px;">Vyravo&nbsp;<span style="color:${BRAND};">AI</span></td>` +
    `<td align="right" style="font:500 11px/16px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${FAINT};letter-spacing:0.06em;text-transform:uppercase;">Business Automation</td>` +
    `</tr></table>`
  );
}

function signatureBlock(industry?: string | null): string {
  const tag = industry ? `Vyravo AI &middot; automation for ${industry} teams` : "Vyravo AI &middot; business automation";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;">` +
    `<tr><td style="border-top:1px solid ${LINE};padding-top:20px;">` +
    `<div style="font:600 15px/20px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">Akshay Navale</div>` +
    `<div style="font:400 13px/19px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${MUTED};">Founder, Vyravo AI</div>` +
    `<div style="font:400 12px/17px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${FAINT};margin-top:2px;">${tag}</div>` +
    `</td></tr></table>`
  );
}

function footerBlock(): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;">` +
    `<tr><td style="border-top:1px solid ${LINE};padding-top:16px;font:400 11px/17px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${FAINT};">` +
    `You're receiving this because your business address is publicly listed and you were reached on a professional note. ` +
    `Not interested? Just reply &ldquo;no thanks&rdquo; and we&rsquo;ll never write again.` +
    `</td></tr></table>`
  );
}

export function renderOutreachHtml(opts: ShellOpts): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<title>${opts.subject.replace(/</g, "&lt;")}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${BG};">` +
    // preheader — the line Gmail shows next to the subject
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:32px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">` +
    `<tr><td style="height:4px;font-size:0;line-height:0;background-color:${BRAND};border-radius:4px 4px 0 0;">&nbsp;</td></tr>` +
    `<tr><td style="background-color:#ffffff;border-radius:0 0 10px 10px;padding:34px 42px 26px;box-shadow:0 1px 2px rgba(23,35,61,0.04);">` +
    brandRow() +
    `<div style="font:400 16px/26px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">` +
    opts.innerHtml +
    `</div>` +
    signatureBlock(opts.industry) +
    footerBlock() +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}

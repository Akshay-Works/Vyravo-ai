// Email sending module — sends via Resend (primary) or Gmail SMTP (fallback).
//
// Resend (recommended):
//   RESEND_API_KEY=re_xxx
//   RESEND_FROM="Vyravo AI <onboarding@resend.dev>"   // use a verified domain
//
// Gmail SMTP fallback:
//   EMAIL_HOST=smtp.gmail.com / EMAIL_PORT=587
//   EMAIL_USER=akshay.navale.work@gmail.com / EMAIL_PASS=<App Password>

import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT || "587", 10);
  const user = process.env.EMAIL_USER || "akshay.navale.work@gmail.com";
  const pass = process.env.EMAIL_PASS;
  if (!pass) return null;
  transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } } as any);
  return transporter;
}

export async function sendEmail(options: EmailOptions): Promise<{ sent: boolean; error?: string; provider: "resend" | "gmail" }> {
  const resendKey = process.env.RESEND_API_KEY;

  // 1) Resend (primary)
  if (resendKey) {
    try {
      const from = process.env.RESEND_FROM || "Vyravo AI <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from,
          to: options.to,
          subject: options.subject,
          html: options.html || options.text,
          text: options.text || options.html?.replace(/<[^>]*>/g, ""),
          reply_to: options.replyTo || "akshay.navale.work@gmail.com",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Resend error (${res.status}): ${text.slice(0, 200)}`);
      }
      return { sent: true, provider: "resend" };
    } catch (e: any) {
      console.error("Resend failed, falling back to Gmail:", e?.message);
    }
  }

  // 2) Gmail SMTP (fallback)
  const t = getTransporter();
  if (!t) return { sent: false, error: "No email provider configured (set RESEND_API_KEY or EMAIL_PASS)", provider: "gmail" };
  try {
    const from = process.env.EMAIL_FROM || "Vyravo AI <akshay.navale.work@gmail.com>";
    await t.sendMail({
      from, to: options.to, subject: options.subject,
      html: options.html || options.text,
      text: options.text || options.html?.replace(/<[^>]*>/g, ""),
      replyTo: options.replyTo || "akshay.navale.work@gmail.com",
    });
    return { sent: true, provider: "gmail" };
  } catch (e: any) {
    console.error("Email send error:", e);
    return { sent: false, error: String(e?.message || e), provider: "gmail" };
  }
}

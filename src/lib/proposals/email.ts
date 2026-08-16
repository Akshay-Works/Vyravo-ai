// Proposal email layer.
//
// Reuses the EXISTING email_queue table (from the site schema) and, when the
// existing Email Automation app is reachable, POSTs to its webhook. This is
// an integration layer — NOT a duplicate email system.

import { pool, db } from "@/db";
import { emailQueue } from "@/db/schema";
import type { Proposal } from "@/db/proposal-schema";

export interface ProposalEmailPayload {
  emailType: string;
  to: string;
  clientName?: string | null;
  companyName?: string | null;
  proposalTitle: string;
  proposalNumber?: string | null;
  proposalUrl?: string;
  secureToken?: string | null;
  amount?: string | null;
  currency?: string | null;
  [key: string]: unknown;
}

/** Best-effort: queue for the site + notify the existing Email Automation app. */
export async function sendProposalEmail(payload: ProposalEmailPayload): Promise<{
  queued: boolean;
  webhook: "sent" | "skipped" | "failed";
}> {
  const result: { queued: boolean; webhook: "sent" | "skipped" | "failed" } = { queued: false, webhook: "skipped" };

  // 1) Queue in the existing email_queue table
  try {
    await db.insert(emailQueue).values({
      leadId: null,
      clientId: null,
      emailType: payload.emailType,
      scheduledFor: new Date(),
      sentAt: null,
      status: "pending",
      templateData: payload as any,
    });
    result.queued = true;
  } catch (e) {
    console.error("Proposal email queue failed:", e);
  }

  // 2) Notify the existing Email Automation app (if configured)
  const webhookUrl = process.env.EMAIL_AUTOMATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "proposal-automation", ...payload }),
        signal: AbortSignal.timeout(5000),
      });
      result.webhook = res.ok ? "sent" : "failed";
    } catch (e) {
      console.error("Email Automation webhook failed:", e);
      result.webhook = "failed";
    }
  }

  return result;
}

/** Build the secure client proposal URL. */
export function proposalUrl(proposal: Proposal): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://vyravo-ai.vercel.app";
  return `${base}/proposal/${proposal.secureToken}`;
}

export function buildProposalEmailPayload(proposal: Proposal, emailType: string): ProposalEmailPayload {
  return {
    emailType,
    to: proposal.clientEmail || "",
    clientName: proposal.clientName,
    companyName: proposal.companyName,
    proposalTitle: proposal.title,
    proposalNumber: proposal.number,
    proposalUrl: proposalUrl(proposal),
    secureToken: proposal.secureToken,
    amount: proposal.total,
    currency: proposal.currency,
  };
}

/** Mark queued emails as sent (used after the external system processes them). */
export async function markEmailSent(emailType: string, recipient: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE email_queue SET status = 'sent', sent_at = now()
       WHERE email_type = $1 AND status = 'pending' AND template_data::text ILIKE $2`,
      [emailType, `%${recipient}%`]
    );
  } catch {
    // best-effort
  }
}

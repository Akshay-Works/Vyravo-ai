// Email queue processor — picks up pending emails from email_queue and sends via Resend/Gmail.
import { pool } from "@/db";
import { sendEmail } from "./send";

export async function processEmailQueue(limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = await pool.query(
    `SELECT * FROM email_queue WHERE status = 'pending' AND scheduled_for <= now()
     ORDER BY scheduled_for LIMIT $1`,
    [limit]
  );

  let sent = 0;
  let failed = 0;

  for (const row of rows.rows as any[]) {
    const data = row.template_data || {};
    const to = data.to || "";
    const subject = data.subject || getDefaultSubject(row.email_type);
    const html = data.html || `<p>${data.message || "Vyravo AI notification."}</p>`;

    if (!to) {
      await pool.query(`UPDATE email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
      failed++;
      continue;
    }

    const result = await sendEmail({ to, subject, html });
    if (result.sent) {
      await pool.query(`UPDATE email_queue SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id]);
      sent++;
    } else {
      await pool.query(`UPDATE email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
      failed++;
    }
  }
  return { sent, failed };
}

function getDefaultSubject(emailType: string): string {
  const subjects: Record<string, string> = {
    proposal_sent: "Your Vyravo AI Proposal",
    proposal_followup_1: "Following up on your proposal",
    proposal_followup_2: "Still interested?",
    proposal_followup_final: "Final follow-up on your proposal",
    invoice_created: "New Invoice from Vyravo AI",
    payment_received: "Payment Confirmation",
    portal_invitation: "Welcome to Vyravo AI Client Portal",
    project_update: "Project Update",
    onboarding: "Getting Started with Vyravo AI",
  };
  return subjects[emailType] || "Vyravo AI Notification";
}

// ============================================================
// Seed email_templates with the production template set for
// Vyravo AI clients (Pune real-estate / property + SMB outreach).
// Run: DATABASE_URL=... npx tsx scripts/seed-email-templates.ts
// Idempotent: templates are upserted by name; user-created
// templates are never touched.
// ============================================================
import { pool } from "../src/db";

const TEMPLATES: { name: string; email_type: string; subject: string; body: string }[] = [
  // ------------------------------------------------------------
  // 1. Welcome — new inquiry (website / contact form)
  // ------------------------------------------------------------
  {
    name: "Welcome — New Inquiry",
    email_type: "new-lead-confirmation",
    subject: "Thanks {{firstName}} — we've got your details",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Thank you for reaching out to Vyravo AI. We've received your details and here's what happens next:</p><p>1. <strong>We review your inquiry</strong> within 24 hours<br/>2. A team member calls you to understand your workflow<br/>3. We prepare a free assessment for <strong>{{industry}}</strong></p><p>If you'd like to get ahead of the queue, simply reply to this email with the best time to reach you.</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Best%20time%20to%20reach%20me" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Reply with your preferred time</a></p><p style="margin-top:24px;margin-bottom:0">Best regards,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com<br/>You're receiving this because you enquired on vyravo-ai.vercel.app</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 2. Intro — qualified lead from the engine (scored ≥ 60)
  // ------------------------------------------------------------
  {
    name: "Intro — Qualified Lead (engine)",
    email_type: "campaign",
    subject: "Quick idea for {{company}} — {{score}}-point fit for {{industry}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>We reviewed <strong>{{company}}</strong> and it scored <strong>{{score}}/100</strong> on our AI-readiness check for {{industry}} businesses.</p><p>One thing stood out: <em>{{challenge}}</em></p><p>{{summary}}</p><p>We help firms like yours capture every inquiry automatically — 24/7 follow-ups, instant lead qualification and pipeline updates, so no enquiry is ever missed again.</p><p>Would a 20-minute call this week make sense? Just reply and I'll work around your schedule.</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Discovery%20call%20—%20{{company}}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Reply to book a call</a></p><p style="margin-top:24px;margin-bottom:0">Best,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 3. Follow-up — no response (day 3)
  // ------------------------------------------------------------
  {
    name: "Follow-Up — No Response (Day 3)",
    email_type: "follow-up",
    subject: "Re: Quick idea for {{company}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>I know inboxes are busy — just floating my earlier note to the top.</p><p>{{summary}}</p><p>If it's not the right time, no problem at all: a one-line reply (or "not now") and I'll leave it there.</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Re%3A%20Quick%20idea%20for%20{{company}}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Reply to {{firstName}}</a></p><p style="margin-top:24px;margin-bottom:0">Warm regards,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 4. Discovery call confirmation
  // ------------------------------------------------------------
  {
    name: "Discovery Call Confirmation",
    email_type: "discovery-call-confirmation",
    subject: "Your discovery call is confirmed — {{meetingDate}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Your discovery call with <strong>{{company}}</strong> is confirmed:</p><table style="background:#eff6ff;border-radius:8px;padding:0;width:100%;margin:8px 0 4px"><tr><td style="padding:14px 18px;font-size:14px"><strong>📅 {{meetingDate}}</strong><br/><strong>🔗 {{meetingTime}}</strong><br/>🎥 Call link: {{meetingLink}}</td></tr></table><p>To make the most of our 30 minutes, it helps to have in mind:</p><p>• Your biggest operational challenges<br/>• Tools you use today<br/>• Goals for the next 6–12 months</p><p>Need to reschedule? Just reply to this email.</p><p style="margin-top:24px;margin-bottom:0">Looking forward,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 5. Meeting reminder (24h)
  // ------------------------------------------------------------
  {
    name: "Meeting Reminder (24h)",
    email_type: "follow-up",
    subject: "Reminder: our call tomorrow — {{company}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Just a friendly reminder about our discovery call <strong>tomorrow</strong>:</p><p><strong>📅 {{meetingDate}}</strong><br/><strong>🎥 {{meetingLink}}</strong></p><p>If something has come up, no worries — reply and we'll find another slot.</p><p style="margin-top:24px;margin-bottom:0">See you then,<br/><strong>Akshay Navale</strong></p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 6. Proposal sent
  // ------------------------------------------------------------
  {
    name: "Proposal Sent",
    email_type: "proposal_sent",
    subject: "Your custom AI proposal — {{company}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Thank you for the conversation — it was great understanding where <strong>{{company}}</strong> is today. I've put together a custom proposal covering:</p><p>✅ Recommended AI solutions for <strong>{{industry}}</strong><br/>✅ Implementation timeline<br/>✅ Investment breakdown<br/>✅ Expected ROI &amp; results metrics</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Proposal%20walkthrough%20—%20{{company}}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Schedule a 15-min walkthrough</a></p><p>I'd be happy to walk you through the details and adjust anything before you decide.</p><p style="margin-top:24px;margin-bottom:0">Best regards,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 7. Proposal follow-up (day 2)
  // ------------------------------------------------------------
  {
    name: "Proposal Follow-Up (Day 2)",
    email_type: "proposal_followup_1",
    subject: "Quick check on your proposal — {{company}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>I wanted to check in on the proposal I sent over — happy to answer any questions or adjust scope to match your priorities.</p><p>Would a quick 15-minute call work this week? I'll keep it short and practical.</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Proposal%20questions%20—%20{{company}}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Reply with a time</a></p><p style="margin-top:24px;margin-bottom:0">Best,<br/><strong>Akshay Navale</strong></p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 8. Onboarding — welcome aboard
  // ------------------------------------------------------------
  {
    name: "Client Onboarding — Welcome Aboard",
    email_type: "onboarding",
    subject: "Welcome aboard, {{company}}! 🎉 Let's get started",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Welcome to the Vyravo AI family — we're thrilled to start working with <strong>{{company}}</strong>.</p><p><strong>Your onboarding checklist:</strong></p><p>1. ✅ Proposal accepted<br/>2. 📋 Share access details (we'll guide you step by step)<br/>3. 🔑 Access your client portal<br/>4. 📅 Kickoff call scheduled within 48 hours<br/>5. 📄 Review the project timeline</p><p>Your dedicated project manager will reach out within 24 hours. Questions? Just reply to this email.</p><p style="margin-top:24px;margin-bottom:0">Let's build something great together,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 9. Project milestone update
  // ------------------------------------------------------------
  {
    name: "Project Milestone Update",
    email_type: "project-update",
    subject: "Milestone completed — {{company}} update",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Great news — we've completed a key milestone for <strong>{{company}}</strong>.</p><p>✅ <strong>What's done:</strong> {{summary}}<br/>📊 <strong>Status:</strong> on track<br/>📅 <strong>Next step:</strong> we'll confirm the next milestone with you this week</p><p>You can review everything in your client portal, or simply reply for a quick status call.</p><p style="margin-top:24px;margin-bottom:0">Best,<br/><strong>Vyravo AI Team</strong></p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 10. Review request
  // ------------------------------------------------------------
  {
    name: "Review Request",
    email_type: "custom",
    subject: "How was your experience with Vyravo AI?",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Now that we're working together at <strong>{{company}}</strong>, we'd love your honest feedback — it helps us improve, and helps other businesses find us.</p><p>⭐ <a href="https://www.google.com/search?q=Vyravo+AI+reviews" style="color:#3B82F6">Leave a Google review</a><br/>💼 <a href="https://www.linkedin.com/in/akshay-n-2692851b7" style="color:#3B82F6">Recommend us on LinkedIn</a></p><p>Thank you for trusting Vyravo AI with your automation journey.</p><p style="margin-top:24px;margin-bottom:0">Warm regards,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 11. Referral request
  // ------------------------------------------------------------
  {
    name: "Referral Request",
    email_type: "custom",
    subject: "Know someone who needs AI automation?",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>Thank you for being an amazing client! If you know a {{industry}} business struggling with missed enquiries or follow-ups, we'd love an introduction.</p><p>For every successful referral:<br/>💰 <strong>₹20,000 credit</strong> on your next project<br/>🎁 <strong>1 month free</strong> support</p><p>Simply reply with their name and number — we'll take it from there.</p><p style="margin-top:24px;margin-bottom:0">Best,<br/><strong>Akshay Navale</strong></p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
  // ------------------------------------------------------------
  // 12. Re-engagement
  // ------------------------------------------------------------
  {
    name: "Re-engagement — New Solutions",
    email_type: "campaign",
    subject: "We'd love to reconnect — new AI solutions for {{industry}}",
    body: `<div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px 8px"><div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0"><div style="background:linear-gradient(90deg,#3B82F6,#06B6D4);padding:20px 28px"><p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.5px">Vyravo <span style="font-weight:400">AI</span></p><p style="margin:4px 0 0;color:#bfdbfe;font-size:12px">Intelligent Automation for Modern Businesses</p></div><div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.7"><p>Hi {{firstName}},</p><p>It's been a while, and a lot has changed at Vyravo AI — we've launched new capabilities that directly help {{industry}} businesses:</p><p>🚀 24/7 AI enquiry capture &amp; instant follow-ups<br/>📊 Lead scoring and pipeline automation<br/>🤖 Voice receptionist that never misses a call</p><p>Would you be open to a quick 15-minute call to see what's new?</p><p style="margin-top:22px"><a href="mailto:akshay.navale.work@gmail.com?subject=Let%27s%20reconnect" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Reply to reconnect</a></p><p style="margin-top:24px;margin-bottom:0">Best,<br/><strong>Akshay Navale</strong><br/>Founder, Vyravo AI</p></div><div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">Vyravo AI · +91 90757 07650 · akshay.navale.work@gmail.com</div></div></div>`,
  },
];

async function seed() {
  // Remove the old placeholder + re-upsert the full set by name.
  const names = TEMPLATES.map((t) => t.name);
  await pool.query(`DELETE FROM email_templates WHERE name = ANY($1::text[]) OR name LIKE 'Intro —%'`, [names]);
  for (const t of TEMPLATES) {
    await pool.query(
      `INSERT INTO email_templates (name, email_type, subject, body, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [t.name, t.email_type, t.subject, t.body]
    );
  }
  const { rows } = await pool.query(`SELECT id, name, email_type FROM email_templates ORDER BY id`);
  console.log(`Seeded ${TEMPLATES.length} templates. Total in table: ${rows.length}`);
  for (const r of rows) console.log(`  #${r.id} ${r.email_type.padEnd(30)} ${r.name}`);
  await pool.end();
}

seed().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});

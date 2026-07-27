// Email Templates for Discovery Call Automation

import type { EmailTemplate } from "./types";
import { COMPANY_KNOWLEDGE } from "../chatbot/knowledge";

const { contact } = COMPANY_KNOWLEDGE;

export function getConfirmationEmail(data: {
  name: string;
  meetingDate: string;
  meetingTime: string;
  timezone: string;
  meetingLink: string;
  calendarLink?: string;
}): EmailTemplate {
  return {
    subject: `✅ Your Discovery Call with Vyravo AI is Confirmed`,
    body: `Hi ${data.name},

Thank you for booking a discovery call with Vyravo AI! We're excited to learn about your business and explore how AI automation can help you save time, reduce costs, and scale.

📅 **Meeting Details**

**Date:** ${data.meetingDate}
**Time:** ${data.meetingTime} (${data.timezone})
**Meeting Link:** ${data.meetingLink}

---

📋 **What We'll Discuss**

1. Your business and current challenges
2. AI automation opportunities specific to your industry
3. Recommended solutions and expected ROI
4. Timeline and investment breakdown
5. Next steps if you'd like to proceed

---

✅ **How to Prepare**

To make the most of our 30 minutes together:

• Think about your biggest operational pain points
• List any repetitive tasks you'd like to automate
• Have an idea of your timeline and budget range
• Note any questions you'd like to ask

---

📞 **Need to Reschedule?**

No problem! Reply to this email or call us at ${contact.phone} to reschedule.

---

We look forward to speaking with you!

Best regards,
The Vyravo AI Team

${contact.phone} | ${contact.email}
${contact.linkedin}`,
    ctaText: "Join Meeting",
    ctaLink: data.meetingLink,
  };
}

export function getReminder24hEmail(data: {
  name: string;
  meetingDate: string;
  meetingTime: string;
  timezone: string;
  meetingLink: string;
}): EmailTemplate {
  return {
    subject: `⏰ Reminder: Your Discovery Call is Tomorrow`,
    body: `Hi ${data.name},

Just a friendly reminder that your discovery call with Vyravo AI is tomorrow!

📅 **${data.meetingDate}** at **${data.meetingTime}** (${data.timezone})

🔗 **Meeting Link:** ${data.meetingLink}

---

**Quick Prep Checklist:**

☐ List your biggest operational challenges
☐ Think about tasks you'd like to automate
☐ Have your timeline and budget in mind
☐ Prepare any questions for us

---

We're looking forward to it! If you need to reschedule, just reply to this email.

Best,
The Vyravo AI Team`,
    ctaText: "Add to Calendar",
    ctaLink: data.meetingLink,
  };
}

export function getReminder2hEmail(data: {
  name: string;
  meetingTime: string;
  timezone: string;
  meetingLink: string;
}): EmailTemplate {
  return {
    subject: `🔔 Your Discovery Call Starts in 2 Hours`,
    body: `Hi ${data.name},

Your discovery call with Vyravo AI starts in 2 hours at **${data.meetingTime}** (${data.timezone}).

🔗 **Join here:** ${data.meetingLink}

See you soon!

The Vyravo AI Team`,
    ctaText: "Join Meeting",
    ctaLink: data.meetingLink,
  };
}

export function getReminder30mEmail(data: {
  name: string;
  meetingLink: string;
}): EmailTemplate {
  return {
    subject: `⚡ Starting in 30 Minutes: Your Discovery Call`,
    body: `Hi ${data.name},

Your discovery call with Vyravo AI starts in 30 minutes!

🔗 **Join here:** ${data.meetingLink}

We're ready when you are!

The Vyravo AI Team`,
    ctaText: "Join Now",
    ctaLink: data.meetingLink,
  };
}

export function getThankYouEmail(data: {
  name: string;
  recommendedServices: string[];
}): EmailTemplate {
  const servicesText = data.recommendedServices.map(s => `• ${s}`).join("\n");
  
  return {
    subject: `🙏 Thank You for Meeting with Vyravo AI`,
    body: `Hi ${data.name},

Thank you for taking the time to meet with us today! It was great learning about your business and discussing how AI automation can help you achieve your goals.

---

**Based on Our Conversation**

We discussed the following solutions for your business:

${servicesText}

---

**Next Steps**

Within the next 48 hours, you'll receive:

1. **Custom Proposal** — Detailed scope, timeline, and investment breakdown
2. **Solution Overview** — How our recommended approach addresses your challenges
3. **ROI Projection** — Expected outcomes and return on investment

---

**In the Meantime**

Feel free to explore some relevant resources:

• Our Services: https://vyravo.ai/services
• Case Studies: https://vyravo.ai/case-studies
• Pricing Overview: https://vyravo.ai/pricing

---

Have any questions? Just reply to this email or call us at ${contact.phone}.

Looking forward to working together!

Best regards,
The Vyravo AI Team`,
    ctaText: "View Our Services",
    ctaLink: "/services",
  };
}

export function getProposalEmail(data: {
  name: string;
  proposalLink: string;
}): EmailTemplate {
  return {
    subject: `📄 Your Custom Proposal from Vyravo AI`,
    body: `Hi ${data.name},

As promised, here's your custom proposal based on our discovery call.

📄 **View Your Proposal:** ${data.proposalLink}

---

**What's Included:**

• Detailed solution scope
• Implementation timeline
• Investment breakdown
• Expected ROI
• Next steps to get started

---

**Ready to Move Forward?**

Simply reply to this email or book a follow-up call to discuss any questions.

📞 ${contact.phone}
📧 ${contact.email}

We're excited about the opportunity to help transform your business with AI automation!

Best regards,
The Vyravo AI Team`,
    ctaText: "View Proposal",
    ctaLink: data.proposalLink,
  };
}

export function getFollowUp2dEmail(data: {
  name: string;
}): EmailTemplate {
  return {
    subject: `Quick Follow-Up: Your AI Automation Proposal`,
    body: `Hi ${data.name},

I wanted to follow up on the proposal we sent after our discovery call.

Have you had a chance to review it? I'd love to answer any questions you might have or discuss any aspects in more detail.

If you're ready to move forward, just reply to this email and we can kick things off immediately.

Best,
The Vyravo AI Team

P.S. If your priorities have changed or you'd like to explore a different approach, let us know — we're flexible!`,
  };
}

export function getFollowUp5dEmail(data: {
  name: string;
}): EmailTemplate {
  return {
    subject: `Still Thinking About AI Automation?`,
    body: `Hi ${data.name},

I hope this finds you well! I wanted to check in and see if you have any questions about the proposal we discussed.

**Quick reminder of what we covered:**

• AI solutions tailored to your specific challenges
• Clear implementation timeline
• Transparent pricing with no hidden fees
• Expected ROI within 3-6 months

If timing isn't right at the moment, no worries at all. Just let me know and I'll follow up later.

Best regards,
The Vyravo AI Team`,
  };
}

export function getFollowUp10dEmail(data: {
  name: string;
  caseStudyLink?: string;
}): EmailTemplate {
  return {
    subject: `One Last Thing Before I Go...`,
    body: `Hi ${data.name},

I don't want to be a pest, so this will be my last follow-up for now.

If AI automation isn't a priority right now, I completely understand. Business priorities shift all the time.

But if you're still considering it, here are a few things that might help:

• **Case Studies:** See how similar businesses achieved results
• **FAQ:** Answers to common questions about our process
• **Free Resources:** Tips on AI automation best practices

When you're ready to revisit this, just reply to this email or book a call directly.

No pressure, no expiration. We'll be here when you need us.

Best,
The Vyravo AI Team`,
  };
}

// Generate internal notification email
export function getInternalNotificationEmail(data: {
  leadName: string;
  businessName?: string;
  industry: string;
  meetingDate: string;
  meetingTime: string;
  leadScore: number;
  leadCategory: string;
  recommendedServices: string[];
  summary: string;
}): EmailTemplate {
  const servicesText = data.recommendedServices.map(s => `• ${s}`).join("\n");
  
  return {
    subject: `🔥 New Discovery Call Booked: ${data.leadName} (${data.leadCategory.toUpperCase()})`,
    body: `**New Discovery Call Booked!**

**Lead Details:**
• Name: ${data.leadName}
• Business: ${data.businessName || "Not provided"}
• Industry: ${data.industry}
• Score: ${data.leadScore}/100 (${data.leadCategory})

**Meeting:**
• Date: ${data.meetingDate}
• Time: ${data.meetingTime}

**Recommended Services:**
${servicesText}

**Summary:**
${data.summary}

---
View full lead details in the dashboard.`,
  };
}

# Vyravo AI — Proposal Automation

A production-ready, AI-powered Proposal Automation System built into the
existing Vyravo AI website. Turns qualified leads into professional,
personalized proposals with AI generation, human review, secure client
viewing, acceptance, tracking, and follow-ups.

## Setup

```bash
npm install
npm run proposal:setup   # additive columns + proposal_* tables + 6 default templates (idempotent)
```

### Environment variables

| Variable | Purpose |
|---|---|
| `EMAIL_AUTOMATION_WEBHOOK_URL` | Optional — POSTs proposal emails to the existing Email Automation app. Without it, emails are queued in the existing `email_queue` table. |
| `DOCUSIGN_ACCESS_TOKEN` / `DROPBOX_SIGN_API_KEY` / `PANDADOC_API_KEY` | Optional e-signature providers (abstraction ready; acceptance works built-in without them). |
| `STRIPE_SECRET_KEY` | Optional — enables Stripe checkout links for payment milestones. |
| `PROPOSAL_EXPIRY_DAYS` | Default proposal validity (default 14). |

`OPENAI_API_KEY` (already used by the chatbot/KB) powers full AI proposal
writing. Without it, generation falls back to a KB-informed template engine.

## Routes

**Admin** (auth required — same session as the Knowledge Base):
- `/admin/proposals` — dashboard + searchable library
- `/admin/proposals/new` — create from template or blank
- `/admin/proposals/[id]` — detail: preview, send, status, events, comments, versions
- `/admin/proposals/[id]/edit` — editor: sections, services, pricing calculator, milestones, AI generate
- `/admin/proposals/templates` — reusable templates (6 default + custom)

**Client** (secure, no login):
- `/proposal/[token]` — mobile-polished client view with Accept / Decline / Request Changes

**API**: `/api/proposals` (CRUD, list), `…/[id]/generate|send|pdf|duplicate|event|comments|status`,
`…/templates`, `…/analytics`, `…/followups/run`, and public `/api/proposal/[token]/…`
(view, event, accept, reject, changes, pdf).

## Workflow

```
Lead → Discovery Call → Requirements → AI Generation (KB-approved content)
→ Draft → Human Review → Approve → Send (email + CRM stage) → Client views
(secure link, tracked) → Accept/Reject/Changes → e-signature record → Invoice
draft → Payment milestones → Client onboarding
```

## Key behaviors

- **AI accuracy:** the generator retrieves APPROVED knowledge from the Internal
  Knowledge Base (services, benefits, case studies, process, terms) and never
  invents client info, pricing, stats, or case studies. Missing fields stay
  placeholders for human review.
- **Human approval:** AI-generated proposals always start as Draft; sending is
  blocked until status is Approved.
- **Pricing:** private per-client; editor includes an internal pricing
  calculator (services, add-ons, discount, tax) and payment milestones
  (100% / 50-50 / 40-30-30 / custom).
- **PDF:** generated server-side with @react-pdf/renderer (Vercel-safe) —
  cover, sections, pricing table, milestones, terms, acceptance, contact.
- **Tracking:** proposal_events records created/sent/delivered/opened/viewed/
  downloaded/accepted/rejected/expired/follow-up with IP + user-agent.
- **CRM:** HubSpot deal stage syncs on generate/send/view/accept (best-effort);
  acceptance auto-creates a client row + invoice draft in the existing
  `clients`/`invoices` tables.
- **Email:** reuses the existing `email_queue` table + optional webhook to the
  existing Email Automation app — no duplicate email system.
- **Follow-ups:** automated sequence (day 2 / 5 / 10) that stops on
  accept/reject/expire/changes; run via the dashboard button or a cron hit on
  `/api/proposals/followups/run`.
- **Security:** non-guessable per-proposal tokens, client isolation, rate
  limiting, audit events, server-side secrets only.

## Database

Reuses the existing `proposals`, `invoices`, `clients`, `email_queue` tables
(additive columns only) + new `proposal_versions`, `proposal_items`,
`proposal_templates`, `proposal_events`, `proposal_comments`,
`proposal_acceptance`, `proposal_payment_milestones`.

# Vyravo AI — LinkedIn Outreach System

Automated **personalized LinkedIn outreach** inside the existing Vyravo Admin CRM:
daily lead detection → qualification → personalization → message generation →
**human approval** → send (approved integration) → tracking → Day 3 / Day 7
follow-ups → analytics. Built as an additional **channel** on top of the
existing outreach architecture (same patterns as the automated cold-email
pipeline) — no separate app, no duplicate systems.

> ⚠️ **Nothing is ever sent automatically.** LinkedIn has no public API for
> sending direct messages to non-connections. This system either (a) hands you
> the exact profile + message to send manually, or (b) posts to **your own
> webhook gateway** (n8n/Zapier/Make/VA tool) if you configure one. It never
> claims a send that didn't happen.

---

## 1. Files changed

### Vyravo-ai (`Akshay-Works/Vyravo-ai`)
| File | What it does |
|---|---|
| `src/lib/linkedin/config.ts` | Settings KV store (`linkedin_config`) — safe defaults (sending OFF, approval ON, 10/day, 10-min gap, FU [3,7], score ≥ 60) |
| `src/lib/linkedin/generator.ts` | No-fabrication personalization: real-CRM-facts only → short summary → unique message via 5 frameworks (+ optional OpenAI path with strict rules + uniqueness guard) |
| `src/lib/linkedin/sender.ts` | Sending abstraction: `manual` (default) or `LINKEDIN_SEND_WEBHOOK_URL` gateway. Recipient is ALWAYS the CRM lead's own `linkedin_url` |
| `src/lib/linkedin/pipeline.ts` | Schema, eligibility, generation, approval, queue, send (rate-limited/capped/emergency-stop), follow-ups @3d/@7d from Email 1, manual ops, analytics dashboard |
| `src/app/api/admin/linkedin/route.ts` | GET dashboard/queue (admin session auth) |
| `src/app/api/admin/linkedin/config/route.ts` | PUT settings (admin session auth) |
| `src/app/api/admin/linkedin/action/route.ts` | POST: generate / simulate / send / approve / edit / regenerate / skip / retry / mark_sent / mark_replied / followups_run / stop / resume |
| `src/app/api/outreach/linkedin/route.ts` | Daily engine hook (`ENGINE_INGEST_KEY` auth) — `?generate=1` (+ optional `?send=1`) |
| `src/app/admin/linkedin-outreach/page.tsx` + `layout.tsx` | New Admin section: KPIs, filters, approval queue, settings, emergency stop, edit/send modals |
| `src/components/knowledge-base/KBShell.tsx` | Nav entry “💼 LinkedIn Outreach” |
| `src/app/admin/leads/page.tsx` | CRM list shows LinkedIn status chip + profile link per lead |
| `src/app/api/engine/leads/route.ts` | Ingests `linkedinUrl` (+ back-fills it on existing dup leads) |
| `src/db/schema.ts` | Drizzle fields for the 9 LinkedIn columns on `leads` |
| `scripts/linkedin-livetest.mts` | 63-check end-to-end live test (mock sender, synthetic leads, self-cleaning) |

### vyravo-lead-engine (`Akshay-Works/vyravo-lead-engine`)
| File | Change |
|---|---|
| `scripts/push-to-crm.mjs` | Selects + pushes `linkedin_url` from `prospects` → CRM |
| `.github/workflows/daily-leads.yml` | After the email hook: `POST /api/outreach/linkedin?generate=1` (non-fatal) |
| `.github/workflows/push-admin.yml` | Same hook on manual pushes |

---

## 2. Database changes (auto-created, idempotent)

- **`outreach_activities`** — multi-channel activity model (`channel` = `linkedin`
  today; `email`/`whatsapp`/`voice` later). Columns: `lead_id`, `channel`,
  `follow_up_number`, `message`, `status`, `personalization_summary`,
  `personalization_data` (jsonb), `provider_message_id`, `framework`,
  `ai_generated`, `scheduled_at`, `queued_at`, `approved_at`, `sent_at`,
  `replied_at`, `follow_up_date`, `error`, timestamps.
  **`UNIQUE (lead_id, channel, follow_up_number)`** → duplicate-proof.
  Indexes: `(channel, status)`, `(lead_id)`, `(sent_at)`.
- **`linkedin_config`** — KV settings (see defaults in §1).
- **`linkedin_send_log`** — one row per real send → daily-limit counting.
- **`leads`** — 9 new columns (mirrors): `linkedin_url`, `linkedin_status`,
  `linkedin_message`, `linkedin_sent_at`, `linkedin_follow_up_date`,
  `linkedin_connection_status`, `linkedin_last_activity`,
  `linkedin_personalization`, `linkedin_error`.

Statuses: `awaiting_approval`, `approved`, `queued`, `sent`, `replied`,
`follow_up_due` (computed), `failed`, `skipped`, `completed`, `not_eligible`.

---

## 3. New environment variables

| Var | Required | Purpose |
|---|---|---|
| `LINKEDIN_SEND_WEBHOOK_URL` | optional | Gateway that performs the actual LinkedIn send (n8n / Zapier / Make / personal automation / VA tool). **Unset = manual mode.** |
| `LINKEDIN_SEND_WEBHOOK_TOKEN` | optional | Bearer token for the gateway above. |

No LinkedIn credentials (no account, no OAuth, no cookies) are ever stored or
sent — deliberately, since LinkedIn's API cannot send DMs. All settings live
server-side; the browser only sees booleans/numbers and never secrets.

---

## 4. New Admin UI components

- **Admin → LinkedIn Outreach** (new page, same shell):
  - KPI cards: leads processed today, generated, awaiting approval, queued,
    sent (today/limit), reply rate, follow-ups generated/due, failed, approved,
    conversion rate.
  - TEST-MODE banner when on.
  - Settings panel: Sending ON/OFF, Require Approval, Test Mode, daily limit,
    min delay (min), max per run, min score, follow-up days, save button,
    sender-mode indicator, **EMERGENCY STOP / Resume**.
  - Filter chips: All / Today / Awaiting Approval / Approved / Queued / Sent /
    Replied / Follow-Up Due / Failed / Skipped.
  - Queue cards: name, company, industry, score, LinkedIn profile link,
    message, personalization reason, status badge, dates, error.
  - Actions per status: **Approve & Queue**, **Edit Message**, **Regenerate**,
    **Skip**, **Send Now** (manual: opens profile + copy; gateway: sends),
    **Mark as Sent (manual)**, **Mark Replied**, **Retry** (failed).
- **Admin → Daily Leads**: red/amber/green **LinkedIn status chip** + profile
  link on every lead row, so the CRM record shows outreach activity at a glance.

---

## 5. Workflow explanation

```
┌ Every morning (engine daily run, 09:30 IST — same trigger as email outreach) ┐
│  push-to-crm  →  POST /api/outreach/linkedin?generate=1                        │
└───────────────────────────────────────────────────────────────────────────────┘
  1. discoverEligibleLeads: new + valid linkedin_url + ≥ min_score + not DNC/
     client/contacted-recently-via-email + no existing LinkedIn record
  2. generateToday: personalization summary + UNIQUE message per lead
     (OpenAI with strict no-fabrication prompt, safe framework fallback)
  3. → status `awaiting_approval` (approval ON by default); lead mirror updated
  4. Admin reviews → Approve & Queue → `approved` → `queued`
  5. Send (only if Sending=ON, stop not active, under daily limit, min delay):
     manual mode → stays queued + Admin shows profile/message to send + Mark as Sent
     gateway mode → POST {leadId, profileUrl, message} → sent_at + provider id
  6. reply (auto/manual) → `replied`, no more follow-ups
  7. scheduleFollowUps: FU1 @ intro+3d, FU2 @ intro+7d (anchor = intro sent_at,
     previous step must be sent) → same approval flow
  8. Analytics always live on the admin page
```

Idempotency: `UNIQUE(lead_id, channel, follow_up_number)` + send-time re-check
of `status='queued'` + daily capped via `linkedin_send_log`.

---

## 6. Test results

`scripts/linkedin-livetest.mts` — real DB, mocked gateway, synthetic leads,
self-cleaning (incl. crash-safe finally):

**63 passed / 0 failed.** Covered: schema + columns; safe defaults;
eligibility (no URL / invalid URL / low score / DNC / already client); message
generation (real facts only, no fabricated research, ≤ 400 chars, per-lead
uniqueness, personalization summary); idempotent generation; approve→queue;
manual mode leaves rows queued (no false failure); gateway send with recipient
== lead's own profile URL (never akshay), auth header, `sent` + provider id +
lead mirror; daily limit cap; emergency stop blocks; test-mode simulate leaves
state untouched (no send log); gateway 500 → `failed` + stored error; retry
(no duplicate); edit; regenerate; mark replied (stops follow-ups); FU1 @ day 3,
FU2 @ day 7 (anchor = intro, FU1 must be sent); no FU when replied; skip;
dashboard. DB left pristine (0 leftover rows, config back to safe defaults).

---

## 7. LinkedIn API limitation (important)

LinkedIn's public APIs **cannot send connection requests or direct messages to
non-connections**. Any tool that does this relies on unofficial automation
(risky — against ToS, can get an account restricted) or a human in the loop.
This system therefore ships with **manual mode** as the default and truthful
option: it prepares everything (profile + personalized message), and you send.
The optional webhook gateway lets you plug in whatever *you* trust (n8n,
Zapier, Make, a VA) — Vyravo itself never stores or uses LinkedIn credentials.

---

## 8. Exact steps to enable production sending

1. **(Recommended) keep manual mode.** Admin → LinkedIn Outreach → Generate →
   review → Approve & Queue → open the profile → send → **Mark as Sent**.
   Follow-ups keep coming at Day 3 / Day 7 automatically.
2. **Or use a gateway:** set `LINKEDIN_SEND_WEBHOOK_URL` (+ optional
   `LINKEDIN_SEND_WEBHOOK_TOKEN`) in Vercel → the gateway receives
   `{leadId, profileUrl, message, source}` and must perform the send.
3. **Test first:** enable **Test Mode** in settings → Generate → Simulate Send
   (nothing leaves the system) → review the queue. Disable Test Mode.
4. **Turn sending on:** Settings → Sending **ON** (Require Approval stays ON),
   set daily limit (default 10) + min delay (default 10 min) + max per run (5).
5. **Workflow check:** the daily engine run already calls
   `?generate=1` — messages appear in "Today" every morning; approve them.
6. **Emergency stop** is always one click away (and is separately enforced
   server-side in `sendBatch` before any send).
```

# Vyravo AI — WhatsApp Outreach System

Automated **personalized WhatsApp outreach** inside the existing Vyravo Admin CRM:
daily lead detection → **opt-in eligibility gate** → phone normalization →
personalization → message generation → **human approval** → **official Meta
WhatsApp Business Platform (Cloud API)** → delivery/read/reply webhooks →
opt-out handling → Day 3 / Day 7 follow-ups → analytics.

Built as `channel = 'whatsapp'` on the **shared outreach_activities model** —
the same table the LinkedIn channel uses. No new app, no duplicate systems,
no unofficial WhatsApp automation of any kind (no scraping, no QR/session
cookies, no browser automation).

---

## 1. Files changed

### Vyravo-ai (`Akshay-Works/Vyravo-ai`)
| File | Purpose |
|---|---|
| `src/lib/whatsapp/config.ts` | KV settings — safe defaults: **Sending OFF · Approval ON · TEST MODE ON · opt-in gate ON · 30/day · 2-min gap · FU [3,7]** |
| `src/lib/whatsapp/phone.ts` | Normalization + validation of messy CRM phones (spaces, landlines, `(+91)`, bare 10-digit + country hint); recipient is ALWAYS the lead's own number |
| `src/lib/whatsapp/generator.ts` | No-fabrication personalization, frameworks A–D (observation/problem/industry/founder) + OpenAI strict prompt + per-lead uniqueness |
| `src/lib/whatsapp/sender.ts` | **WhatsAppService** — `validateRecipient`, `sendTemplateMessage`, `sendAllowedSessionMessage`, `getMessageStatus`, `isOptOutMessage`/`handleOptOut`; Cloud API only; surfaces Meta policy errors (131026…) without ever faking success |
| `src/lib/whatsapp/pipeline.ts` | Schema, eligibility gate (opt-in required), generation, approval, queue, sending (capped/delayed/emergency-stop), manual ops, follow-ups, webhook handlers, analytics |
| `src/lib/whatsapp/webhook.ts` | Meta signature verify (HMAC-SHA256 w/ App Secret, fails closed) + event parsing |
| `src/app/admin/whatsapp-outreach/page.tsx` + `layout.tsx` | New Admin section — KPIs, filters (Today/Awaiting/Approved/Queued/Sent/Delivered/Read/Replied/FU-Due/Failed/Opted-Out), approval queue, settings, **EMERGENCY STOP**, template registry, edit modal |
| `src/app/api/admin/whatsapp/*` | GET dashboard · PUT config · POST action (generate/simulate/send/approve/edit/regenerate/skip/retry/mark_sent|delivered|read|replied/opt_in/opt_out/followups_run/stop/resume) · GET+PUT templates |
| `src/app/api/webhooks/whatsapp/route.ts` | Meta webhook: GET verify handshake + POST signed status/reply events |
| `src/app/api/outreach/whatsapp/route.ts` | Daily engine hook (`ENGINE_INGEST_KEY`) |
| `src/app/api/engine/leads/route.ts` (unchanged) | Phone already ingested from the engine |
| `src/components/knowledge-base/KBShell.tsx` | Nav entry “💬 WhatsApp Outreach” |
| `src/app/admin/leads/page.tsx` | CRM list shows WhatsApp status/opt-in chip + masked number |
| `src/db/schema.ts` | Drizzle fields for the 14 WhatsApp columns on `leads` |
| `scripts/whatsapp-livetest.mts` | 81-check end-to-end live test (mock Graph API, synthetic leads, self-cleaning) |

### vyravo-lead-engine (`Akshay-Works/vyravo-lead-engine`)
| File | Change |
|---|---|
| `.github/workflows/daily-leads.yml` · `push-admin.yml` | Added `POST /api/outreach/whatsapp?generate=1` after the email + LinkedIn hooks (non-fatal) |

---

## 2. Database changes (auto-created, idempotent)

- **`outreach_activities`** (shared, extended): new columns `campaign_id`,
  `template_name`, `template_language`, `phone_number`, `delivered_at`,
  `read_at`; index on `provider_message_id`; **UNIQUE(lead_id, channel,
  follow_up_number)** duplicate lock. Rows use `channel='whatsapp'`.
- **`whatsapp_config`** — KV (defaults in §1).
- **`whatsapp_send_log`** — one row per real API send (daily limit).
- **`whatsapp_replies`** — every incoming WhatsApp message (lead timeline).
- **`whatsapp_templates`** — local registry mapping to Meta-approved template
  names (provider_name, language, category, purpose, active flag).
- **`leads`** — 14 new mirror columns: `whatsapp_number`, `whatsapp_country_code`,
  `whatsapp_opt_in_status`, `whatsapp_outreach_status`, `whatsapp_message`,
  `whatsapp_message_id`, `whatsapp_sent_at`, `whatsapp_delivered_at`,
  `whatsapp_read_at`, `whatsapp_replied_at`, `whatsapp_follow_up_date`,
  `whatsapp_last_activity`, `whatsapp_error`, `whatsapp_opt_out_at`.

Outreach statuses: `awaiting_approval`, `approved`, `queued`, `sent`,
`delivered`, `read`, `replied`, `follow_up_due` (computed), `failed`, `skipped`,
`completed`, `not_eligible`, `opted_out`. Opt-in statuses: `Unknown` /
`Opted In` / `Not Opted In` / `Opted Out`.

---

## 3. Environment variables required

| Var | Required for | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | sending | Meta Cloud API token (system user / permanent token) — server-side only |
| `WHATSAPP_PHONE_NUMBER_ID` | sending | WABA phone-number ID (the sender number) |
| `WHATSAPP_APP_SECRET` | webhooks | Meta App secret — verifies `X-Hub-Signature-256` |
| `WHATSAPP_VERIFY_TOKEN` | webhooks | Your own chosen token for the GET handshake |
| `WHATSAPP_GRAPH_VERSION` | optional | Graph API version (default `v23.0`) |

Configure all in **Vercel → Project Settings → Environment Variables** (and
locally in `.env.local` for development). **No credentials are ever sent to
the browser, logged, or returned by any API.**

---

## 4. API configuration required (Meta side)

1. Create a Meta **WhatsApp Business Account (WABA)** + a **Meta app**
   (Business → WhatsApp → add a phone number — a real, active number that can
   receive the verification code).
2. Generate a **system-user token** (or permanent token) with
   `whatsapp_business_messaging` permission → `WHATSAPP_ACCESS_TOKEN`.
3. Find the **phone-number ID** (WhatsApp Manager → Phone numbers) →
   `WHATSAPP_PHONE_NUMBER_ID`.
4. **Create + submit templates** in WhatsApp Manager for the three purposes:
   `vyravo_wa_intro_v1` (MARKETING, 1 body variable), `vyravo_wa_fu1_v1`,
   `vyravo_wa_fu2_v1`. Each template's body is a single `{{1}}` variable that
   carries the personalized message text (keep under ~300 chars).
   Wait for Meta approval.
5. In the registry (Admin → WhatsApp Outreach → Templates) mark each template
   **ACTIVE** only after Meta approves it.
6. Webhooks: set **Graph API → WhatsApp → Configuration → Callback URL** to
   `https://vyravo-ai.vercel.app/api/webhooks/whatsapp`, verify token =
   `WHATSAPP_VERIFY_TOKEN`, and subscribe to the **messages** field
   (`messages` webhook). Then the GET handshake + signed POSTs work.

---

## 5. Admin UI changes

**Admin → WhatsApp Outreach**:
- Dashboard cards: Today's leads, Generated, Awaiting approval, Sent today,
  Delivered/Read, Reply rate, Failed, Follow-ups, Opt-outs, Calls booked,
  Clients.
- TEST MODE banner + “API not configured” banner (both honest, and both
  show while sending is impossible).
- Settings: Sending ON/OFF, Require Approval, Test Mode, Require Opt-In,
  daily limit, min delay, max per run, min score, follow-up days, campaign ID,
  **⛔ EMERGENCY STOP / Resume**.
- **Template registry** table (active/inactive per purpose).
- Filters: All / Today / Awaiting Approval / Approved / Queued / Sent /
  Delivered / Read / Replied / Follow-Up Due / Failed / Opted Out.
- Queue cards with actions: **Approve & Queue · Edit · Regenerate · Skip ·
  Send Now · Mark as Sent/Delivered/Read/Replied (manual) · Retry · Opt Out**.
- CRM (Admin → Daily Leads): WhatsApp status chip, opt-in state, masked number.

---

## 6. Automation workflow

```
Engine daily run (09:30 IST)  ──→  POST /api/outreach/whatsapp?generate=1
  1. discoverEligibleLeads: valid phone + OPTED IN + ≥ min_score + not DNC/
     client + no prior WhatsApp record + no recent email outreach (cooldown)
  2. normalize → international format; invalid → Not Eligible (reason stored)
  3. generateToday: summary + unique message (framework A–D / OpenAI) →
     status = Awaiting Approval (Approval ON by default)
  4. Admin approves → queued
  5. Sending (only if enabled + not test + no stop + API configured):
     • intro/follow-up → sendTemplateMessage via Cloud API
     • Meta policy rejection / no approved template → Failed
       "Blocked — WhatsApp Policy/Eligibility: …" (Retry available)
  6. Webhook statuses: sent/delivered/read/failed → CRM + mirrors updated
  7. Incoming reply → Replied + recorded in whatsapp_replies + FOLLOW-UPS STOP
  8. Opt-out keywords → Opted Out + DNC + all future WhatsApp blocked
  9. scheduleFollowUps: FU1 @ intro+3d, FU2 @ intro+7d (template-gated)
```

---

## 7. Test results

`scripts/whatsapp-livetest.mts` — real DB, **mocked Meta Graph API**, synthetic
leads, self-cleaning (incl. crash-safe finally): **81 passed / 0 failed**,
zero leftovers. All 14 spec scenarios covered:

T1 eligible → generate → approve → queue ✓ · T2 no-opt-in blocked ✓ ·
T3 invalid phone blocked ✓ · T4 opted-out blocked ✓ · T5 duplicate prevention
(generation + approval) ✓ · T6 test-mode simulate (no state change) ✓ ·
T7 API success → wamid stored, template type, recipient = lead's own number ✓ ·
T8 webhook delivered ✓ · T9 webhook read ✓ · T10 reply → follow-ups cancelled ✓ ·
T11 opt-out reply blocks everything ✓ · T12 daily limit cap ✓ ·
T13 emergency stop ✓ · T14 API failure → failed + error + retry ✓.
Plus: phone normalization (6 formats), template policy block (131026 shown,
never "sent"), FU1@3d/FU2@7d math, opt-in gate toggle, manual ops, webhook
signature + handshake, email-cooldown channel coordination, dashboard.

---

## 8. WhatsApp / Meta limitations (honest)

- **Business-initiated messages REQUIRE an approved template** (24h
  customer-service sessions allow free text — the code supports
  `sendAllowedSessionMessage` for that case, but outreach messages always use
  templates). This is Meta policy, not a code choice.
- **Phone number ≠ consent.** The system's default gate blocks every lead
  without a recorded opt-in. Marking "Opted In" is a human, documented
  decision — the system never assumes it.
- **"Delivered/read" are only as good as Meta's webhooks** — they arrive only
  for the template conversations Meta reports; some numbers won't produce
  read receipts (user privacy settings).
- **No unofficial automation**: WhatsApp Web scraping, QR/session-cookie
  tricks and unofficial libraries are deliberately not implemented.
- If Meta rejects a message (e.g. 131026 undeliverable, 131030 not allowed),
  the row becomes `Failed` with the provider error and a Retry button — it is
  never counted as sent.

---

## 9. Exact steps to enable production sending

1. **Verify the flow in TEST MODE** (already the default): Admin → WhatsApp
   Outreach → *Generate Today's Outreach* → review the queue → *Simulate Send*
   → confirm "would send" results with zero state changes.
2. **Configure Meta** (§4): WABA + number, token, phone-number ID, app secret,
   verify token → set the 5 env vars in Vercel (redeploy).
3. **Approve templates** in WhatsApp Manager → mark ACTIVE in the registry.
4. **Register the webhook** in Meta (callback URL, verify token, subscribe
   `messages`) → confirm GET handshake + a test status event updates the CRM.
5. **Mark real leads as Opted In** only where you legitimately have consent
   (or disable the opt-in gate consciously when following an approved
   consent policy — defaults keep it ON).
6. Settings → **Test Mode OFF** → **Sending ON** (keep Approval ON, limits
   30/day, 2-min delay, 10/run). Approve the morning queue; follow-ups then
   run automatically on Day 3 / Day 7.
7. **Emergency stop** remains one click away & is also enforced server-side
   before every send.

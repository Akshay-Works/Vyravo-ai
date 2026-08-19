# Integrations — Vyravo AI

## OpenAI (website chatbot)

The public chatbot runs on the **OpenAI Responses API** (official `openai` SDK),
grounded in the site content + PUBLIC Knowledge Base, with structured-output
lead qualification that feeds the existing HubSpot and discovery-call flows.
Set `OPENAI_API_KEY` in Vercel; without it the chatbot falls back to the
built-in engine. Full details: **[OPENAI.md](./OPENAI.md)**.

## Voice Receptionist

The AI Voice Receptionist lives at `/voice-receptionist` (dashboard, call history,
call details, configuration). It answers calls, detects intent, qualifies leads,
books discovery calls, syncs the existing HubSpot CRM, and triggers the existing
Email Automation app — currently in **Demo Mode** (simulated line).

### Environment variables (Vercel project: `vyravo-ai`)

| Variable | Required | Purpose |
|---|---|---|
| `ADMIN_API_KEY` | Optional | When set, all `/api/voice/*` endpoints require the `x-admin-key` header (call history, config, stats are then protected). When unset, endpoints run in open demo mode. |
| `EMAIL_AUTOMATION_WEBHOOK_URL` | Optional | Webhook in the Email Automation app that receives voice follow-up triggers (`new_qualified_lead`, `callback_request`, `appointment_booked`, `human_escalation`). Without it, triggers are recorded honestly as "queued (simulated)". |
| `VOICE_PROVIDER` | Optional | `demo` (default) or `live`. The live adapter is reserved — Demo Mode never pretends real calls are connected. |
| `VOICE_STORE` | Optional | `memory` forces the in-memory store (local testing). Default: project database. |

### Architecture

- **UI** — `src/app/voice-receptionist/*` + `src/components/voice/*`
- **API** — `src/app/api/voice/*` (status, config, demo-call, conversation, end-call, calls, stats)
- **AI layer** — `src/lib/voice/engine.ts` (intent detection + conversation state machine), `src/lib/voice/knowledge.ts` (`getBusinessKnowledge()` — the future Internal Knowledge Base plugs in here)
- **Integration layer** — `src/lib/voice/integrations.ts` (reuses `lib/integrations/hubspot.ts`, existing Discovery Call + Email Automation apps)
- **Provider layer** — `src/lib/voice/provider.ts` (`VoiceProvider` interface; `DemoVoiceProvider` implemented)
- **Data layer** — `src/lib/voice/storage.ts` (drizzle tables `voice_calls`, `voice_config`; falls back to in-memory if DB is unreachable)

### Schema

Tables `receptionist_calls` and `receptionist_config` are defined in `src/db/schema.ts`
(names are scoped to avoid colliding with other voice tables that may share the database).
They self-create on first use (`CREATE TABLE IF NOT EXISTS`); the canonical
migration command is `npx drizzle-kit push`.

### Honesty rules

- All dashboard/analytics numbers are computed from stored calls only.
- Demo Mode is labeled everywhere; no fabricated client results.
- Escalation never pretends a transfer happened — callback requests instead.
- CRM sync failures are stored with the call and marked "CRM sync failed — retry required" (retry from the call detail page).

---

## Integrations — HubSpot

All secrets live **only** in Vercel environment variables (server-side).

## Environment variables (Vercel project: `vyravo-ai`)

| Variable | Required | Purpose |
|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Yes, for sync | HubSpot private app token. Scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write` (+ `crm.schemas.contacts.read/write` to auto-create `vyravo_*` custom fields — without it the sync falls back to standard fields only). |

## Lead sources wired to HubSpot

| Source | Endpoint | HubSpot effect |
|---|---|---|
| Contact form | `POST /api/contact` | Contact created/updated (deduped by email) + deal at **Prospecting** |
| AI chatbot | `POST /api/chat` | When a visitor shares a valid email in chat, contact created/updated + deal at **Prospecting** (`leadCaptured` in the response reports the outcome). With `OPENAI_API_KEY` set, the AI also extracts name, company, industry, business size, main problem, current workflow, desired outcome and interest level from the conversation and syncs them to the same contact/deal. |

The discovery-call booking flow (its own app) captures fuller leads — see the `Vyravo-Ai-Discovery-Call` repo.

## Graceful degradation

If `HUBSPOT_ACCESS_TOKEN` is missing, forms and chat keep working normally and responses report `hubspot.configured: false`. Existing DB persistence (`contact_submissions`) is unchanged.

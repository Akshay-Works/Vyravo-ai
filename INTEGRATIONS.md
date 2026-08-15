# Integrations — HubSpot

All secrets live **only** in Vercel environment variables (server-side).

## Environment variables (Vercel project: `vyravo-ai`)

| Variable | Required | Purpose |
|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Yes, for sync | HubSpot private app token. Scopes: `crm.objects.contacts.read/write`, `crm.objects.deals.read/write` (+ `crm.schemas.contacts.read/write` to auto-create `vyravo_*` custom fields — without it the sync falls back to standard fields only). |

## Lead sources wired to HubSpot

| Source | Endpoint | HubSpot effect |
|---|---|---|
| Contact form | `POST /api/contact` | Contact created/updated (deduped by email) + deal at **Prospecting** |
| AI chatbot | `POST /api/chat` | When a visitor shares a valid email in chat, contact created/updated + deal at **Prospecting** (`leadCaptured` in the response reports the outcome) |

The discovery-call booking flow (its own app) captures fuller leads — see the `Vyravo-Ai-Discovery-Call` repo.

## Graceful degradation

If `HUBSPOT_ACCESS_TOKEN` is missing, forms and chat keep working normally and responses report `hubspot.configured: false`. Existing DB persistence (`contact_submissions`) is unchanged.

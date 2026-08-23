# Vyravo AI WhatsApp AI Chatbot

This integration uses the official **Meta WhatsApp Business Platform / WhatsApp Cloud API**. It is not a simulated WhatsApp inbox.

## What is included

- `POST /api/whatsapp/webhook` verifies Meta signatures, parses incoming events, deduplicates messages, and queues processing.
- `GET /api/whatsapp/webhook` handles Meta's webhook verification challenge.
- Incoming text, reply-button, and list-reply messages use the existing Vyravo AI chatbot, OpenAI path, and public Knowledge Base when configured.
- Conversations and messages are persisted in PostgreSQL in `whatsapp_conversations` and `whatsapp_messages`.
- Lead facts are collected conversationally and synced to the existing HubSpot integration, deduplicated by email or WhatsApp phone number.
- Booking requests use the existing `SITE_LINKS.discoveryCall` URL.
- Explicit human requests move the conversation to `HUMAN_HANDOFF`. If the existing Email Automation webhook is configured, a `human_escalation` notification is sent; otherwise the customer is told honestly that no live notification was configured.
- `GET/PATCH /api/whatsapp/conversations/:conversationId` is an admin-only debugging endpoint protected by `x-admin-key` and `ADMIN_API_KEY`.

## 1. Meta setup

1. Go to [Meta for Developers](https://developers.facebook.com/) and create or select a Business app.
2. Add the **WhatsApp** product and open **API Setup**.
3. For initial testing, use Meta's test business phone number and add your own WhatsApp number as a recipient. For client use, add and verify a real business phone number and complete any required business verification/display-name review.
4. Create a long-lived/system-user access token with the WhatsApp messaging permissions required by your Meta account. Copy the **Phone number ID** from API Setup. Never put the token in browser code or Git.
5. In the app's WhatsApp **Configuration** page, add a webhook callback:

   ```text
   https://YOUR-PRODUCTION-DOMAIN/api/whatsapp/webhook
   ```

   Use the exact random string you chose for `META_WHATSAPP_VERIFY_TOKEN` as the Verify token. Meta will call the GET endpoint and the deployment must return its challenge.

6. Subscribe the WhatsApp Business Account to the **messages** webhook field. Message events include inbound messages and delivery/read status updates. The callback must be HTTPS in production.
7. Make sure the Meta app is in the appropriate live/production mode before accepting messages from customers outside the test recipients. Confirm the business phone, display name, quality rating, approved templates, and customer opt-in rules in Meta before sending outbound template messages. This app only sends a reply after an inbound customer message, so it does not bypass WhatsApp's messaging-window rules.

The WABA/business account ID is useful in Meta's dashboard and subscription tooling, but this runtime only needs the phone number ID for sending and the webhook metadata check; it is not required as an application secret.

## 2. Environment variables

Set these in `.env.local` for development and in Vercel Project Settings → Environment Variables for Preview/Production:

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes for production | PostgreSQL connection used for conversation/message persistence. Use a managed PostgreSQL URL in Vercel. |
| `META_WHATSAPP_ACCESS_TOKEN` | Yes for live WhatsApp | Meta Cloud API bearer token. Server-side only. |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Yes for live WhatsApp | The Meta phone number ID used in `/{phone-number-id}/messages`. |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | Recommended | The WABA ID from Meta. Signed events with another WABA ID are ignored when this is set. |
| `META_WHATSAPP_VERIFY_TOKEN` | Yes for webhook setup | Private random value used in the GET verification handshake. |
| `META_WHATSAPP_APP_SECRET` | Yes for secure POST webhooks | Meta app secret used to validate `X-Hub-Signature-256`. |
| `OPENAI_API_KEY` | Recommended | Enables the existing OpenAI structured chat path. If absent, the existing deterministic Vyravo AI chatbot engine is used. |
| `HUBSPOT_ACCESS_TOKEN` | Optional | Enables the existing HubSpot create/update contact and deal flow. Phone-only WhatsApp leads are supported; email is still collected when useful. |
| `EMAIL_AUTOMATION_WEBHOOK_URL` | Optional | Existing Email Automation webhook. When set, it receives `human_escalation` payloads for handoff notification. |
| `ADMIN_API_KEY` | Recommended | Protects the WhatsApp conversation debug/status-control endpoint. The WhatsApp admin endpoint fails closed if it is absent. |
| `META_GRAPH_API_VERSION` | Optional | Graph API version override. Default is `v23.0`; update it when Meta requires a newer supported version. |
| `WHATSAPP_STORE` | Local tests only | Set to `memory` only for a local smoke test without PostgreSQL. Do not use it for production. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Optional | Public digits-only number used by the website `wa.me` click-to-chat CTA. Defaults to the current Vyravo number. Not a secret. |

`CALENDLY_ACCESS_TOKEN` is not needed by this webhook: the chatbot links to the existing discovery-call flow already defined in `SITE_LINKS.discoveryCall`. The Meta WABA ID is optional for the runtime, but setting `META_WHATSAPP_BUSINESS_ACCOUNT_ID` adds an extra account-mismatch check.

## 3. Local testing

1. Copy `.env.example` to `.env.local` and set the four Meta variables, `DATABASE_URL`, and `OPENAI_API_KEY` if available. Keep the app secret and access token server-side.
2. Start the app:

   ```bash
   npm install
   npm run dev
   ```

3. Meta cannot call `localhost`. Expose the local Next server through an HTTPS tunnel such as ngrok or Cloudflare Tunnel:

   ```bash
   ngrok http 3000
   ```

   Use the HTTPS tunnel URL plus `/api/whatsapp/webhook` in Meta's callback configuration.

4. Verify the handshake without exposing the real token in shell history where possible:

   ```bash
   curl "https://YOUR-TUNNEL/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test-challenge"
   ```

   A valid setup returns `test-challenge` as plain text. An invalid token returns `403`.

5. Send a WhatsApp message from an approved test recipient to the Meta test number. Watch the server logs for:
   - `Incoming WhatsApp message`
   - `WhatsApp message processing started`
   - `WhatsApp response sent`
   - `WhatsApp CRM update completed` (only when HubSpot is configured and a lead is ready)

6. If PostgreSQL is unavailable, use `WHATSAPP_STORE=memory` for a short-lived local test. Memory mode is process-local and loses context on restart; it is not production persistence.

To test signature validation locally, calculate the header with the Meta app secret and the **exact raw JSON body**:

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIGNATURE="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_WHATSAPP_APP_SECRET" | sed 's/^.* //')"
curl -X POST "http://localhost:3000/api/whatsapp/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  --data "$BODY"
```

The endpoint acknowledges a valid envelope with JSON such as `{ "received": true, "queued": 0 }`. A real message is processed after the acknowledgement, so use server logs and the WhatsApp client to confirm the reply.

## 4. Production deployment on Vercel

1. Add all production environment variables in Vercel, including a persistent managed PostgreSQL URL. Do not set `WHATSAPP_STORE=memory`.
2. Redeploy after saving environment variables.
3. In Meta, use the final Vercel HTTPS URL as the callback and verify it with the same `META_WHATSAPP_VERIFY_TOKEN`.
4. Subscribe the app/WABA to `messages` and send a test message from a real opted-in number.
5. Confirm the Vercel logs and the `whatsapp_conversations` / `whatsapp_messages` tables. Use the admin endpoint with `x-admin-key` to inspect or reactivate a conversation:

   ```bash
   curl -H "x-admin-key: $ADMIN_API_KEY" \
     "https://YOUR-PRODUCTION-DOMAIN/api/whatsapp/conversations/CONVERSATION_ID"

   curl -X PATCH -H "x-admin-key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"status":"AI_ACTIVE"}' \
     "https://YOUR-PRODUCTION-DOMAIN/api/whatsapp/conversations/CONVERSATION_ID"
   ```

The route runs on the Node.js runtime and schedules message processing after Meta receives a fast 200 response. Keep the OpenAI/HubSpot timeouts and database connection suitable for Vercel's serverless execution. For high-volume deployments, move the in-memory rate limiter and background work to a shared queue/Redis worker rather than relying on one server instance.

## 5. End-to-end scenarios to check

Use a fresh WhatsApp number or clear test conversation and verify:

1. `Hi` → short welcome/help response.
2. `What does Vyravo AI do?` → services explanation grounded in Vyravo knowledge.
3. `I run a real estate company.` → real-estate recommendations and one useful follow-up.
4. `I want an AI chatbot.` → chatbot capabilities and a discovery question.
5. `How much does it cost?` → customized-pricing explanation, never an invented amount.
6. `I want to book a call.` → the existing discovery-call link, not a made-up URL.
7. `I want to talk to a human.` → status changes to `HUMAN_HANDOFF`; the response accurately reflects whether the optional notification workflow accepted the request.
8. Send an image/audio/sticker → a useful text-only fallback, with no AI guess about the media.
9. Replay the same Meta payload → it is acknowledged but does not generate a second reply.

This repository has not been tested against your Meta account, phone number, OpenAI account, HubSpot portal, or Vercel deployment until you add those credentials and run the flow. Do not describe the integration as live until that external test succeeds.

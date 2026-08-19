# OpenAI Integration — Vyravo AI

The website chatbot is powered by the **OpenAI Responses API** via the official
`openai` Node SDK, grounded in the existing Vyravo AI site content and the
PUBLIC Knowledge Base.

## Environment variables (Vercel project: `vyravo-ai`)

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Yes, for AI chat | Server-side OpenAI key. Without it the chatbot automatically falls back to the built-in deterministic engine — the site never breaks. |
| `OPENAI_CHAT_MODEL` | Optional | Chat model. Default **`gpt-4o-mini`** — cost-efficient and right-sized for website Q&A. |
| `OPENAI_TIMEOUT_MS` | Optional | Per-request timeout. Default `20000`. |
| `OPENAI_MAX_RETRIES` | Optional | SDK retries on 429/5xx/connection errors. Default `1`. |
| `OPENAI_CHAT_MAX_TOKENS` | Optional | Max reply tokens. Default `700`. |
| `CHATBOT_PROVIDER` | Optional | Force `internal` \| `openai` \| `anthropic` \| `gemini`. Unset = OpenAI when `OPENAI_API_KEY` exists, else `internal`. |

**Setting it in Vercel:** Project → Settings → Environment Variables → add
`OPENAI_API_KEY` for Production, Preview and Development → redeploy. Never put
the key in `NEXT_PUBLIC_*`, in code, or in a committed file.

## Security model

- The key is read **only** in `src/lib/openai/client.ts`, which is imported
  exclusively by server-side modules (route handlers and `src/lib/**`).
- `client.ts` throws if it is ever evaluated in a browser context.
- No API response, error payload, or log line contains the key:
  `classifyOpenAIError()` maps provider errors to safe categories and
  `redactSecrets()` scrubs anything resembling a key or bearer token.
- Visitors only ever see curated copy — never a provider error string.
- Every `.env*` file is git-ignored except the placeholder `.env.example`.

## Architecture

```
Visitor → ChatWidget (client)
        → POST /api/chat            ← validation + per-IP rate limit
        → PUBLIC Knowledge Base     ← optional grounding context
        → OpenAI Responses API      ← structured output (reply + lead fields)
        → lead merge                → EXISTING HubSpot sync (deduped by email)
                                    → EXISTING discovery-call booking link
```

| Layer | File |
|---|---|
| Shared OpenAI client, config, error classification | `src/lib/openai/client.ts` |
| Chat prompt, JSON schema, response parsing | `src/lib/chatbot/openai-chat.ts` |
| Provider router (openai / anthropic / gemini / internal) | `src/lib/chatbot/providers.ts` |
| API endpoint | `src/app/api/chat/route.ts` |
| Company source of truth | `src/lib/chatbot/knowledge.ts`, `src/lib/chatbot/system-prompt.ts` |
| KB grounding context | `src/lib/knowledge-base/chat-integration.ts` |

### One call, two jobs

A single request returns **both** the visitor-facing reply and the
qualification data, using Structured Outputs (`strict: true`). This avoids a
second extraction call, halving latency and cost:

```jsonc
{
  "reply": "...",
  "intent": "qualification",
  "interest_level": "high",
  "ready_to_book": false,
  "lead": {
    "name": null, "email": null, "phone": null, "company": null,
    "industry": null, "business_size": null, "main_problem": null,
    "current_workflow": null, "desired_outcome": null
  }
}
```

Extracted fields are merged into the conversation's `leadInfo` (never
overwriting a known value with null) and flow into the **existing** HubSpot
workflow — no duplicate CRM path was created. `ready_to_book` attaches the
**existing** discovery-call link (`SITE_LINKS.discoveryCall`).

## Anti-hallucination rules

The system prompt hard-codes: no invented pricing, testimonials, client
results, guarantees, case studies, certifications or capabilities; statistics
must stay labelled illustrative; unknown answers must be admitted and routed to
a discovery call or the real contact details. Knowledge Base excerpts, when
present, are authoritative and are never revealed as "sources" to the visitor.

## Failure behaviour

| Failure | Result |
|---|---|
| `OPENAI_API_KEY` missing | Internal engine answers; server logs a one-line warning |
| 401 / 403 | Internal engine answers; log says "check OPENAI_API_KEY" (no key printed) |
| 429 rate limit | SDK retry, then internal engine |
| 5xx / network / timeout | SDK retry where sensible, then internal engine |
| Output not matching the schema | Internal engine (visitors never see raw model output) |
| Everything fails | `"Sorry, I'm having trouble processing that right now. Please try again or book a discovery call."` |

Responses include `aiProvider` (`openai` \| `internal`) and `degraded` so
degradation is observable without exposing internals.

## Request validation

- `message` must be a non-empty string ≤ 2000 characters
- Malformed JSON → `400` with a friendly message
- Client-supplied context is rebuilt server-side: roles whitelisted, history
  capped at 24 messages, per-message content capped, lead fields length-capped
- Per-IP rate limit: 20 chat messages/minute (`429` + `Retry-After`)

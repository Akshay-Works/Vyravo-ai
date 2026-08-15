# Vyravo AI — Internal Knowledge Base

A private, authenticated knowledge base built into the existing Vyravo AI
website. It is the single source of truth for company knowledge and powers
the website chatbot, AI Voice Receptionist, and future AI systems — with
strict public/internal separation.

## How to set up

### 1. Install dependencies

```bash
npm install
```

### 2. Database setup (run once, idempotent)

The core KB tables already exist in the database and are reused as-is
(`kb_categories`, `kb_documents`, `kb_chunks`, `kb_embeddings`,
`kb_document_versions`, `kb_document_blobs`, `kb_users`, `kb_sessions`,
`kb_audit_logs`). The setup script applies two additive columns, creates the
two genuinely new tables (`kb_knowledge_gaps`, `kb_queries`), seeds default
categories, and seeds existing website knowledge as PUBLIC + APPROVED docs:

```bash
npm run kb:setup
```

To re-embed all chunks with the configured embedding provider (needed after
switching providers, or if old rows used a different vector space):

```bash
npm run kb:reembed
```

### 3. Environment variables

Create a `.env.local` (or set in Vercel):

```bash
# --- Knowledge Base auth ---
# Shared admin password fallback. Also works with the existing kb_users
# table (email + scrypt password) — provision users there for real logins.
KB_ADMIN_PASSWORD=choose-a-strong-password

# --- Embedding provider (choose one) ---
# local      = bundled MiniLM model, zero API cost (default; smaller model)
# openai     = best quality   → requires OPENAI_API_KEY
# cohere     → requires COHERE_API_KEY
# google     → requires GOOGLE_API_KEY or GEMINI_API_KEY
EMBEDDING_PROVIDER=local

# --- LLM for the AI assistant (optional; falls back to extractive answers) ---
OPENAI_API_KEY=sk-...            # also used by the existing chatbot
KB_LLM_MODEL=gpt-4o-mini

# --- Voice receptionist KB enrichment toggle ---
VOICE_KB_ENABLED=true
```

> Production recommendation: `EMBEDDING_PROVIDER=openai` with an
> `OPENAI_API_KEY` for significantly better semantic search quality.
> Without any key, `local` (MiniLM) is used; without embeddings the system
> automatically falls back to keyword search, so it always works.

### 4. Access

- **Login:** `/admin/login` (email + password against `kb_users`, or the
  `KB_ADMIN_PASSWORD` fallback)
- **Dashboard:** `/admin/knowledge-base`
- All `/admin/knowledge-base/*` routes and `/api/knowledge-base/*` endpoints
  require a valid session. Unauthenticated requests are redirected/blocked.

## Routes

| Route | Purpose |
|---|---|
| `/admin/login` | Admin login |
| `/admin/knowledge-base` | Dashboard (stats, usage, gaps alert) |
| `/admin/knowledge-base/documents` | Document library (search/filter/sort/actions) |
| `/admin/knowledge-base/documents/upload` | Drag-and-drop upload (PDF/DOCX/TXT/MD/CSV/XLSX) |
| `/admin/knowledge-base/documents/[id]` | View/edit/versions/reprocess |
| `/admin/knowledge-base/articles` | Knowledge articles list |
| `/admin/knowledge-base/articles/new` | Create article (manual or AI-drafted) |
| `/admin/knowledge-base/search` | Semantic + keyword hybrid search |
| `/admin/knowledge-base/assistant` | AI assistant with citations |
| `/admin/knowledge-base/gaps` | Knowledge gaps management |

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/admin` | POST/GET/DELETE | Login, session status, logout |
| `/api/knowledge-base/documents` | GET/POST | List/filter docs, create manual doc |
| `/api/knowledge-base/documents/[id]` | GET/PATCH/DELETE | Read, update, delete |
| `/api/knowledge-base/documents/[id]/process` | POST | Process/reprocess (retry) |
| `/api/knowledge-base/upload` | POST | File upload + processing |
| `/api/knowledge-base/search` | GET | Knowledge search |
| `/api/knowledge-base/ask` | POST | RAG assistant answer + sources |
| `/api/knowledge-base/categories` | GET/POST | Categories |
| `/api/knowledge-base/gaps` | GET/POST/PATCH | Knowledge gaps |
| `/api/knowledge-base/analytics` | GET | Dashboard + usage analytics |

## Integrations

- **Website chatbot** (`/api/chat`): retrieves PUBLIC + PUBLISHED/APPROVED
  knowledge through `lib/knowledge-base/public-client.ts` and uses it to
  answer general questions. The internal engine stays authoritative for the
  intents it handles well. Customer-facing retrieval can NEVER see internal,
  confidential, client-specific or restricted content.
- **Voice Receptionist** (`/api/voice/conversation`): enriches weak intents
  (general inquiry / unknown) with PUBLIC + APPROVED knowledge; strong FAQ
  intents keep the deterministic engine answers.
- **Future systems** (CRM assistant, proposal automation, email automation):
  call `searchPublicKnowledge()` (customer-facing) or
  `searchKnowledge()`/`askKnowledge()` (internal) from
  `lib/knowledge-base/*`.

## Architecture notes

- **Vector search:** pgvector (`kb_embeddings.embedding`) with a JSONB
  fallback; provider-agnostic interface so Pinecone/Qdrant/Weaviate can be
  swapped in later.
- **Chunking:** structure-aware (headings, sections, lists, page markers) —
  never blind character splits.
- **RAG:** retrieve → filter (access/status/space) → hybrid rank → LLM
  (citation-styled) → answer with sources. Hallucination-guarded: no-answer
  message when the KB lacks the knowledge; knowledge gaps are logged.
- **Permissions:** `access_level` (PUBLIC/INTERNAL/CONFIDENTIAL/CLIENT-SPECIFIC/
  RESTRICTED) + document status (draft/review/approved/published/archived).
  Only PUBLIC + PUBLISHED/APPROVED is customer-facing.
- **Client isolation:** `space_id` on all rows; the default `knowledge_spaces`
  row (id 1) is Vyravo AI's internal space. Client spaces can be added and
  queried with `clientSpaceId` scoping.
- **Versioning:** every edit writes a new `kb_document_versions` row
  (content + hash + change summary); rollback = restore a previous version.
- **Original files are never lost:** uploads are stored as blobs
  (`kb_document_blobs`); failed indexing can be retried without re-uploading.
- **Error handling:** every failure path returns a graceful response and the
  chatbot/voice always fall back to their deterministic engines.
- **Rate limiting:** in-memory sliding-window limits on KB APIs
  (`ask` 20/min, `search` 60/min, `upload` 10/min, `write` 30/min per IP).
  Fail-open by design; swap for Redis on multi-instance deployments.

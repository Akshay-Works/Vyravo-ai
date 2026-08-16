# Vyravo AI — Client Portal

A secure, mobile-friendly Client Portal where Vyravo AI clients can manage
their entire relationship — projects, proposals, invoices, files, messages,
support tickets, activity, and profile.

## Setup

```bash
npm run portal:setup   # creates client_users, client_sessions, client_files,
                       # client_messages, notifications, onboarding_tasks tables
```

### Environment variables

| Variable | Purpose |
|---|---|
| `PORTAL_UPLOAD_DIR` | Directory for file uploads (default `/tmp/portal-uploads`) |

All other env vars (auth, database, email) are shared with the existing systems.

## Routes

**Client (no login required):**
- `/portal/login` — sign in

**Client (authenticated — session-cookie protected):**
- `/portal/dashboard` — welcome, stats, quick actions
- `/portal/projects` — project list with progress
- `/portal/projects/[id]` — project detail, milestones timeline
- `/portal/proposals` — view proposals (reuses existing Proposal Automation)
- `/portal/invoices` — invoice list
- `/portal/files` — shared files
- `/portal/messages` — secure messaging with Vyravo AI team
- `/portal/tickets` — support ticket creation and tracking
- `/portal/activity` — client-visible activity timeline
- `/portal/settings` — profile & logout
- `/portal/onboarding` — onboarding checklist

**Admin** (same session as Knowledge Base / Proposals):
- `/admin/portal/clients` — list all portal clients
- `/admin/portal/clients/[id]` — client detail (projects, proposals, invoices, users, files)

## Key design decisions

- **Client isolation** enforced at EVERY database query — all backend queries
  scope by `client_id` from the authenticated session. Client A can never see
  Client B's data.
- **Auth** uses the same scrypt password hashing + opaque session token pattern
  as the existing admin auth (`kb_users`/`kb_sessions`), but with a separate
  `client_users` / `client_sessions` table. Architects for Google/MS login,
  magic links, and 2FA via the same pattern.
- **Reuse** of existing tables: `clients`, `projects` (with milestones JSONB),
  `invoices`, `proposals` (from Proposal Automation), `tasks` (as support
  tickets), `meetings`, `activities`, `email_queue`.
- **Notifications** use the existing `email_queue` table for email delivery +
  in-portal `client_notifications` table.
- **File uploads** stored in `PORTAL_UPLOAD_DIR` with metadata in
  `client_files`. Signed/private URLs pattern designed for future cloud storage.
- **Look & feel** matches the existing Vyravo AI dark glass design system.
  Responsive sidebar navigation adapts to mobile.

## API

All `/api/portal/*` endpoints require a valid portal session cookie. Every
query is scoped to the authenticated client's `client_id`.

| Endpoint | Purpose |
|---|---|
| `/api/portal/auth` | Login, session status, logout |
| `/api/portal/auth/register` | Self-registration (invitation-based) |
| `/api/portal/dashboard` | Dashboard stats + recent data |
| `/api/portal/projects` | Project list |
| `/api/portal/projects/[id]` | Project detail + milestones |
| `/api/portal/proposals` | Proposals (scoped by client) |
| `/api/portal/invoices` | Invoices (scoped by client) |
| `/api/portal/files` | File list + upload |
| `/api/portal/messages` | Messages — list, send, mark read |
| `/api/portal/tickets` | Support tickets — list, create |
| `/api/portal/activity` | Activity timeline |
| `/api/portal/notifications` | In-portal notifications |

Admin endpoints (require admin session):

| Endpoint | Purpose |
|---|---|
| `/api/portal/admin/clients` | List all portal clients |
| `/api/portal/admin/clients/[id]` | Client detail |

## Security

- Every API route verifies the client session before returning data.
- Every database query filters by `client_id`.
- Registration requires at minimum name, email, and password (8+ chars).
- File uploads are restricted to safe file types and size-capped at 25 MB.
- Passwords are hashed with scrypt (same format as admin auth).
- Session tokens are opaque 64-char hex strings, stored httpOnly.
- Rate limiting applies to login and registration endpoints.

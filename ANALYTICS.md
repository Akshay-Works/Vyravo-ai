# Vyravo AI — Analytics Dashboard

A centralized business-intelligence dashboard at `/admin/analytics` that
queries ALL existing Vyravo AI systems in real time — no duplicate data
storage, no fabricated metrics.

## Data sources (all existing tables, read-only)

| Source | Table | Metrics |
|---|---|---|
| Leads | `leads` | total, qualified, stage, source |
| Proposals | `proposals` (+ `proposal_events`) | created/sent/viewed/accepted/rejected/expired, value, conversion |
| Invoices | `invoices` | revenue, paid, outstanding, trend by month |
| Clients | `clients` | active/total clients |
| Projects | `projects` | active/completed/on-hold/delayed, avg progress |
| Voice Receptionist | `receptionist_calls` | calls, answered/qualified |
| Knowledge Base | `kb_queries`, `kb_knowledge_gaps` | queries, gaps |
| Activity | `activities` | recent activity feed |

## Features

- **Executive KPI cards** with period-over-period comparison
  (↑/↓ % vs previous period — only when historical data exists)
- **Date range filter**: Today / Yesterday / 7d / 30d / Month / Quarter /
  Year / All Time (8 periods)
- **Charts** (Recharts, matches the dark glass design):
  - Revenue trend (area chart)
  - Lead trend (bar chart)
  - Conversion funnel (Leads → Qualified → Sent → Viewed → Accepted → Clients)
  - Lead sources (pie)
  - Revenue by service (bars)
- **Proposal activity** summary grid
- **AI systems** panel (KB queries, knowledge gaps, voice calls)
- **Recent activity feed** + **actionable alerts**
  (overdue invoices, proposals awaiting response 5+ days, open knowledge gaps)
- **Drill-down**: alerts link to the relevant admin section

## API

- `GET /api/analytics?period=30d` — full dashboard payload
- `POST /api/analytics/events` — centralized event tracking
  (uses the existing `analytics_events` table)
- Both require the admin session (401 otherwise); events API is rate-limited

## Event tracking

A central `trackEvent()` utility writes to the existing `analytics_events`
table. Event types: lead_created/qualified, call_booked/completed,
proposal_created/sent/viewed/accepted/rejected, client_created,
project_created, invoice_created, payment_received, portal_login,
file_uploaded, message_sent, knowledge_query/gap, chat_started/resolved,
email_sent/opened/clicked, support_ticket_created/resolved.

## Performance

- Real-time queries against indexed existing tables
- No aggregation tables needed at this scale
- Date filtering pushes `WHERE created_at >= ?` to Postgres
- Charts render lazily with Recharts `ResponsiveContainer`

## Permissions

- Requires admin session (same as KB/Proposals/Portal management)
- Aggregated data only — no client-confidential details exposed
- No client-specific data leaked across tenants (no client filters yet)

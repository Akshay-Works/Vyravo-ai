-- ============================================================================
-- OUTREACH PIPELINE SCHEMA (reference only — the app auto-creates these on
-- first pipeline call via CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS; you do NOT need to run anything manually).
-- ============================================================================

-- One row per email event per lead per follow-up number.
-- UNIQUE(lead_id, follow_up_number) is the database-level duplicate guard:
-- a lead can never receive email 1 twice, or follow-up 1 twice, etc.
CREATE TABLE IF NOT EXISTS outreach_events (
  id serial PRIMARY KEY,
  lead_id integer NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,          -- the lead's real email (as recorded)
  subject text NOT NULL,
  body text NOT NULL,
  follow_up_number integer NOT NULL DEFAULT 0,  -- 0 = email 1, 1 = follow-up 1, 2 = follow-up 2
  status text NOT NULL DEFAULT 'queued',  -- queued|sent|failed|skipped|cancelled
  error_message text,
  resend_id text,                         -- Resend message id (delivery events can join on this)
  test_send boolean NOT NULL DEFAULT false,
  queued_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (lead_id, follow_up_number)
);
CREATE INDEX IF NOT EXISTS idx_outreach_events_status ON outreach_events(status);
CREATE INDEX IF NOT EXISTS idx_outreach_events_sent ON outreach_events(sent_at);

-- Admin-configurable knobs (kv):
--   auto_outreach   = true|false  (ON → queue + send automatically)
--   test_mode       = true|false  (ON → all sends go to test_recipient)
--   test_recipient  = email
--   daily_limit     = int         (max production sends per day)
--   follow_up_days  = json array  ([3,7] → follow-up 1 at day 3, follow-up 2 at day 7)
--   min_gap_secs    = int         (min delay between consecutive sends)
--   min_score       = int         (only leads >= score enter the pipeline)
CREATE TABLE IF NOT EXISTS outreach_config (
  k text PRIMARY KEY,
  v text NOT NULL
);

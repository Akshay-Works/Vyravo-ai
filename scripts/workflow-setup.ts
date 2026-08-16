import { pool } from "../src/db/index";
async function main() {
  console.log("Creating workflow_executions table…");
  await pool.query(`CREATE TABLE IF NOT EXISTS workflow_executions (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    event_id TEXT,
    workflow_key VARCHAR(80) NOT NULL UNIQUE,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL,
    client_id INTEGER, lead_id INTEGER, project_id INTEGER,
    trigger JSONB, result JSONB,
    attempt_count INTEGER DEFAULT 0,
    last_error TEXT,
    next_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now() NOT NULL,
    updated_at TIMESTAMP DEFAULT now() NOT NULL,
    completed_at TIMESTAMP
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS wf_status_idx ON workflow_executions(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS wf_client_idx ON workflow_executions(client_id)`);
  console.log("workflow_executions ready");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

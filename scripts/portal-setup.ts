import { pool } from "../src/db/index";
async function main() {
  console.log("Creating portal tables…");
  const tables: [string, string][] = [
    ["client_users", `(id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT, job_title TEXT, timezone VARCHAR(50) DEFAULT 'UTC', role VARCHAR(30) DEFAULT 'owner' NOT NULL, password_hash TEXT, is_active BOOLEAN DEFAULT true, email_verified_at TIMESTAMP, last_login_at TIMESTAMP, invited_by INTEGER, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["client_sessions", `(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, client_id INTEGER NOT NULL, expires_at TIMESTAMP NOT NULL, ip TEXT, user_agent TEXT, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["client_files", `(id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER, uploaded_by INTEGER, name TEXT NOT NULL, original_name TEXT, mime_type TEXT, size_bytes INTEGER, storage_path TEXT, category VARCHAR(50) DEFAULT 'general', access_level VARCHAR(30) DEFAULT 'client', description TEXT, version INTEGER DEFAULT 1, is_archived BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["client_messages", `(id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER, ticket_id INTEGER, sender_type VARCHAR(20) NOT NULL, sender_name TEXT, sender_user_id INTEGER, content TEXT NOT NULL, has_attachments BOOLEAN DEFAULT false, is_read BOOLEAN DEFAULT false, read_at TIMESTAMP, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["message_attachments", `(id SERIAL PRIMARY KEY, message_id INTEGER NOT NULL, file_name TEXT, file_type TEXT, file_size INTEGER, file_url TEXT, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["client_notifications", `(id SERIAL PRIMARY KEY, client_user_id INTEGER NOT NULL, type VARCHAR(50) NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, is_read BOOLEAN DEFAULT false, read_at TIMESTAMP, created_at TIMESTAMP DEFAULT now() NOT NULL)`],
    ["onboarding_tasks", `(id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL, project_id INTEGER, title TEXT NOT NULL, description TEXT, category VARCHAR(50), status VARCHAR(30) DEFAULT 'pending', sort_order INTEGER DEFAULT 0, completed_at TIMESTAMP, created_at TIMESTAMP DEFAULT now() NOT NULL, updated_at TIMESTAMP DEFAULT now() NOT NULL)`],
  ];
  for (const [name, ddl] of tables) {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${name} ${ddl}`);
    console.log(`  ${name} ready`);
  }
  console.log("Portal tables ready");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

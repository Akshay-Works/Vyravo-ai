// WhatsApp existence-check storage: per-lead result + the Baileys
// session bundle (stored server-side so the nightly GitHub job can
// resume it without re-scanning the QR every run).
import { pool } from "@/db";

export async function ensureWhatsappCheckSchema() {
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_exists boolean`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_checked_at timestamptz`);
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_checked_number text`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_wa_exists ON leads(whatsapp_exists)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS whatsapp_session (
    id integer PRIMARY KEY DEFAULT 1,
    data jsonb,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT whatsapp_session_single CHECK (id = 1)
  )`);
}

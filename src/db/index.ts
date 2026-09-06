import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// SECURITY (2026-09-06): a live Neon connection string with credentials was
// previously hardcoded here in this PUBLIC repo. Removed — the app now reads
// DATABASE_URL from the environment (Vercel → Project Settings → Environment
// Variables), exactly as .env.example documents, and FAILS LOUD if it's
// missing rather than ever falling back to a hardcoded secret.
// ACTION: rotate the Neon password in the Neon console; the old string is
// already exposed in public git history and must be treated as compromised.
let databaseUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
if (databaseUrl && /^postgres(ql)?:\/\//.test(databaseUrl) && !databaseUrl.includes("sslmode=")) {
  // Neon (and most hosted PG) requires TLS; never connect without it
  databaseUrl += (databaseUrl.includes("?") ? "&" : "?") + "sslmode=require";
}
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set — add it in Vercel (or .env.local), then restart. " +
    "Hardcoded database credentials were removed from this public repo for security."
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

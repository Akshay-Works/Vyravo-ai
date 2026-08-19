import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getOpenAIStatus } from "@/lib/openai/client";

export const dynamic = "force-dynamic";

/**
 * Health / configuration check.
 *
 * Reports ONLY whether OPENAI_API_KEY is present in the server environment and
 * which chat model is selected. It never returns the key, any part of it, or
 * its length — so this is safe to call from anywhere.
 */
export async function GET() {
  const openai = getOpenAIStatus();

  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }

  return Response.json(
    {
      ok: dbOk,
      db: dbOk,
      openai: {
        configured: openai.configured,
        model: openai.model,
        // What the chatbot will actually do on the next message:
        chatbot: openai.configured ? "openai" : "internal-engine-fallback",
      },
    },
    { status: dbOk ? 200 : 500 }
  );
}

// ENGINE_INGEST_KEY auth shared by the engine-facing foreign routes.
// Accepts both header styles the engine may use (x-engine-key / Bearer).
import { NextRequest } from "next/server";

export function engineAuthed(req: NextRequest): boolean {
  const key = (process.env.ENGINE_INGEST_KEY || "").trim();
  if (!key) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return req.headers.get("x-engine-key") === key || (token !== "" && token === key);
}

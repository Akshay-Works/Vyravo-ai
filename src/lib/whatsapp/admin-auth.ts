import { timingSafeEqual } from "node:crypto";

/**
 * Protects WhatsApp conversation debugging endpoints. Unlike the legacy demo
 * endpoints, these routes fail closed when ADMIN_API_KEY is not configured.
 */
export function isWhatsAppAdminAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_API_KEY?.trim();
  const received = request.headers.get("x-admin-key")?.trim();
  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

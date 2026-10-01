import { getCurrentUser } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

// POST /api/auth/presence — heartbeat. getCurrentUser records last_seen.
export async function POST() {
  await getCurrentUser();
  return new Response(null, { status: 204 });
}

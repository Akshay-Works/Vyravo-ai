import { NextRequest } from "next/server";
import { getPortalSession } from "@/lib/portal/auth";
import { getClientInvoices } from "@/lib/portal/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const session = await getPortalSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const invoices = await getClientInvoices(session.clientId);
    return Response.json({ invoices });
  } catch (e) {
    console.error("Portal invoices error:", e);
    return Response.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { isAdminAuthenticated } from "@/lib/knowledge-base/auth";
import { pool } from "@/db";
import { createInvoice, sendInvoice } from "@/lib/sales/invoices";

export const dynamic = "force-dynamic";

// Founder invoice control: creation drafts + escalates for approval; send
// moves the deal invoice_sent → payment_pending via the lifecycle engine.
// GET → recent invoices. POST { action: create|send, leadId?, amount?, currency?, proposalId?, invoiceId? }
export async function GET(_request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = await pool.query(
    `SELECT i.*, l.business_name, l.email AS lead_email FROM sales_invoices i
     LEFT JOIN leads l ON l.id = i.lead_id ORDER BY i.id DESC LIMIT 50`).catch(() => ({ rows: [] as any[] }));
  return Response.json({ ok: true, invoices: r.rows });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const action = String(b.action || "");
  try {
    if (action === "create") {
      const leadId = Number(b.leadId);
      const amount = Number(b.amount);
      if (!leadId || !(amount > 0)) return Response.json({ error: "leadId + positive amount required" }, { status: 400 });
      const r = await createInvoice(leadId, { amount, currency: b.currency || "INR", proposalId: b.proposalId ? Number(b.proposalId) : null });
      return Response.json({ ok: true, ...r });
    }
    if (action === "send") {
      const invoiceId = Number(b.invoiceId);
      if (!invoiceId) return Response.json({ error: "invoiceId required" }, { status: 400 });
      await sendInvoice(invoiceId, "admin");
      return Response.json({ ok: true, sent: invoiceId });
    }
    return Response.json({ error: "action must be create|send" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e).slice(0, 300) }, { status: 400 });
  }
}

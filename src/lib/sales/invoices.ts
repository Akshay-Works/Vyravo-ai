// ============================================================================
// SALES OS — invoice/payment architecture. Provider-agnostic ledger:
// manual bank-transfer today, Stripe checkout the moment STRIPE_SECRET_KEY is
// set (reuses @/lib/proposals/payment). Payment webhooks are idempotent on
// provider_ref — the same event twice records payment exactly once.
// ============================================================================
import { pool } from "@/db";
import { ensureSalesSchema, logDecision, createEscalation } from "./schema";

function invoiceNo(): string {
  const y = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `VY-${y}-${rand}`;
}

export async function createInvoice(leadId: number, opts: {
  amount: number; currency?: string; proposalId?: number | null; dueDays?: number; paymentLink?: string | null;
}): Promise<{ id: number; invoiceNo: string }> {
  await ensureSalesSchema();
  if (!(opts.amount > 0)) throw new Error("invoice requires a positive amount");
  const no = invoiceNo();
  const ins = await pool.query(
    `INSERT INTO sales_invoices (lead_id, proposal_id, invoice_no, amount, currency, status, due_date, payment_link)
     VALUES ($1,$2,$3,$4,$5,'draft', now() + ($6 || ' days')::interval, $7) RETURNING id`,
    [leadId, opts.proposalId ?? null, no, opts.amount, (opts.currency || "INR").slice(0, 8),
     String(opts.dueDays ?? 7), opts.paymentLink ?? null]);
  const id = Number(ins.rows[0].id);
  await pool.query(`UPDATE leads SET deal_value = $2, deal_currency = $3 WHERE id = $1`,
    [leadId, opts.amount, (opts.currency || "INR").slice(0, 8)]).catch(() => {});
  await logDecision({
    lead_id: leadId, trigger_text: "invoice", action: "invoice_created", autonomy: "L2",
    reason: `invoice ${no} drafted (${opts.currency || "INR"} ${opts.amount}) — founder approval required`,
    context: { invoiceId: id, proposalId: opts.proposalId }, result: "drafted",
  });
  await createEscalation({
    lead_id: leadId, kind: "invoice_approval",
    title: `🧾 Invoice ${no} ready to send (${opts.currency || "INR"} ${opts.amount})`,
    detail: `Drafted from the agreed deal. Verify amount, scope and payment link before sending.`,
    recommendation: "Approve in Sales → Founder Actions, then send.",
  });
  return { id, invoiceNo: no };
}

/** Founder-approved send: marks sent, emits INVOICE_SENT + PAYMENT_PENDING. */
export async function sendInvoice(invoiceId: number, actor = "admin"): Promise<void> {
  await ensureSalesSchema();
  const inv = (await pool.query(`SELECT * FROM sales_invoices WHERE id = $1`, [invoiceId])).rows[0];
  if (!inv) throw new Error("invoice not found");
  if (!["draft", "sent"].includes(String(inv.status))) throw new Error(`cannot send invoice in status ${inv.status}`);
  await pool.query(`UPDATE sales_invoices SET status = 'sent', updated_at = now() WHERE id = $1`, [invoiceId]);
  await logDecision({
    lead_id: inv.lead_id, trigger_text: "invoice", action: "invoice_sent", autonomy: "none",
    reason: `invoice ${inv.invoice_no} sent by ${actor}`, context: { invoiceId }, result: "sent",
  });
  const { emitSalesEvent } = await import("./lifecycle");
  await emitSalesEvent({ key: `invoice-sent-${invoiceId}`, type: "INVOICE_SENT", leadId: inv.lead_id, payload: { invoiceId, invoiceNo: inv.invoice_no } });
  await emitSalesEvent({ key: `invoice-pending-${invoiceId}`, type: "PAYMENT_PENDING", leadId: inv.lead_id, payload: { invoiceId, invoiceNo: inv.invoice_no } });
}

/**
 * Record a provider-confirmed payment. Idempotent on provider_ref/paymentId:
 * the same webhook twice records payment exactly once.
 */
export async function recordPayment(p: {
  providerRef: string; leadId?: number | null; invoiceId?: number | null;
  paymentId?: string | null; amount?: number | null; currency?: string | null; provider?: string;
}): Promise<{ applied: boolean; invoiceId: number | null }> {
  await ensureSalesSchema();
  const ref = String(p.providerRef || "").slice(0, 200);
  if (!ref) throw new Error("recordPayment requires providerRef");

  // Already recorded? → no-op (webhook retry safety).
  const seen = await pool.query(`SELECT id, lead_id, invoice_no, amount, currency FROM sales_invoices WHERE provider_ref = $1`, [ref]);
  if ((seen.rowCount ?? 0) > 0) return { applied: false, invoiceId: Number(seen.rows[0].id) };

  let inv: any = null;
  if (p.invoiceId) {
    inv = (await pool.query(`SELECT * FROM sales_invoices WHERE id = $1`, [p.invoiceId])).rows[0];
  }
  if (!inv && p.leadId) {
    inv = (await pool.query(
      `SELECT * FROM sales_invoices WHERE lead_id = $1 AND status IN ('sent','pending') ORDER BY id DESC LIMIT 1`, [p.leadId])).rows[0];
  }
  if (!inv) {
    await logDecision({
      lead_id: p.leadId ?? null, trigger_text: "payment", action: "payment_unmatched",
      autonomy: "L1", reason: `payment ${ref} has no matching invoice — escalated`,
      context: { providerRef: ref }, result: "unmatched", status: "blocked",
    });
    await createEscalation({
      lead_id: p.leadId ?? null, kind: "payment_unmatched",
      title: "Payment received but no invoice matched",
      detail: `Provider ref ${ref}. Match it manually to an invoice.`,
      recommendation: "Find the invoice and confirm payment manually.",
    });
    return { applied: false, invoiceId: null };
  }
  if (String(inv.status) === "paid") return { applied: false, invoiceId: Number(inv.id) };

  await pool.query(
    `UPDATE sales_invoices SET status = 'paid', provider = $2, provider_ref = $3,
       payment_id = COALESCE($4, payment_id), paid_at = now(), updated_at = now() WHERE id = $1`,
    [inv.id, (p.provider || "manual").slice(0, 20), ref, p.paymentId || null]);
  const { emitSalesEvent } = await import("./lifecycle");
  await emitSalesEvent({
    key: `payment-${ref}`, type: "PAYMENT_RECEIVED", leadId: inv.lead_id,
    payload: { invoiceId: inv.id, invoiceNo: inv.invoice_no, amount: Number(p.amount ?? inv.amount), currency: p.currency || inv.currency, paymentId: p.paymentId || ref },
  });
  return { applied: true, invoiceId: Number(inv.id) };
}

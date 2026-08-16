// Payment abstraction.
//
// Milestones are stored per proposal. A Stripe-ready checkout is provided but
// only activates when STRIPE_SECRET_KEY is configured. Until then, payment
// instructions are shown on the proposal (manual bank/transfer) and a draft
// invoice row exists in the existing `invoices` table after acceptance.

export interface PaymentProvider {
  id: "stripe" | "manual";
  name: string;
  configured: boolean;
}

export function getPaymentProvider(): PaymentProvider {
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY);
  return stripe
    ? { id: "stripe", name: "Stripe", configured: true }
    : { id: "manual", name: "Bank transfer / invoice", configured: true };
}

export interface CreateCheckoutInput {
  proposalId: number;
  amount: number;
  currency: string;
  description: string;
  clientEmail: string;
  milestoneLabel?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  ok: boolean;
  provider: PaymentProvider["id"];
  checkoutUrl?: string;
  error?: string;
}

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const provider = getPaymentProvider();
  if (provider.id === "manual") {
    return {
      ok: true,
      provider: "manual",
      error: undefined,
    };
  }
  return createStripeCheckout(input);
}

async function createStripeCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, provider: "stripe", error: "Stripe not configured" };
  try {
    // Stripe REST API via fetch — no SDK dependency; only active with STRIPE_SECRET_KEY.
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "payment",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(Math.round(input.amount * 100)),
        "line_items[0][price_data][product_data][name]": input.description,
        customer_email: input.clientEmail,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "metadata[proposalId]": String(input.proposalId),
        "metadata[milestone]": input.milestoneLabel || "",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Stripe error ${res.status}: ${text.slice(0, 200)}`);
    }
    const session = await res.json();
    return { ok: true, provider: "stripe", checkoutUrl: session.url || undefined };
  } catch (e: any) {
    console.error("Stripe checkout failed:", e);
    return { ok: false, provider: "stripe", error: String(e?.message || e) };
  }
}

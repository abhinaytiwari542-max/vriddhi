import Razorpay from "razorpay";

import type { CreatePaymentLinkInput, PaymentLinkResult, RazorpayGateway } from "@/backend/lib/razorpay/types";

/**
 * Razorpay's real contact-number validation counts every character in the
 * string toward its 8-14 length check, including hyphens and parentheses
 * — it strips "+" and spaces but not "-". The seeded demo data uses a
 * human-readable "+91-741-5913789" format, which is 15 characters and
 * fails that check. Confirmed live against the real test API (Phase 28):
 * "+917415913789", "917415913789", "7415913789", and "+91 7415913789"
 * all succeed; "+91-741-5913789" fails with exactly this error. Strip
 * everything but digits and a leading "+" before sending.
 */
function sanitizeContact(contact: string | null | undefined): string | undefined {
  if (!contact) return undefined;
  const cleaned = contact.replace(/[^\d+]/g, "");
  return cleaned || undefined;
}

/**
 * Wraps the real Razorpay SDK against TEST MODE credentials. Exercised
 * live against a real test-mode account starting Phase 28 (no GST/KYC
 * needed for test mode, only for live — corrected the Phase 12
 * assumption). getRazorpayGateway() (gateway.ts) returns this instead of
 * the simulated client the moment RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are
 * set, with no other code change required.
 */
export class RealRazorpayGateway implements RazorpayGateway {
  readonly mode = "real" as const;
  private client: Razorpay;

  constructor(keyId: string, keySecret: string) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const link = await this.client.paymentLink.create({
      amount: input.amountPaise,
      currency: input.currency,
      description: input.description,
      reference_id: input.referenceId,
      customer: {
        name: input.customerName,
        email: input.customerEmail ?? undefined,
        contact: sanitizeContact(input.customerContact),
      },
      notify: { sms: false, email: false },
    });

    return { id: link.id, shortUrl: link.short_url, status: link.status };
  }

  async findPaymentLinkByReference(referenceId: string): Promise<PaymentLinkResult | null> {
    // Razorpay's list endpoint doesn't take reference_id as a server-side
    // filter in this SDK's types, so we page through and match locally.
    // Fine at this project's scale (checking one target after a failure);
    // a higher-volume version would need the raw reference_id query param.
    //
    // Measured live against the real test API (Phase 28): a just-created
    // link does NOT appear in this list endpoint immediately — there's a
    // real propagation delay, observed at ~1.4s, before it's visible here.
    // The simulated gateway's in-memory map never had this problem, so it
    // never surfaced until testing against the real account. This matters
    // because this function is the one thing failure-handling trusts to
    // tell "it actually happened despite an error" from "it really
    // didn't" — a false "not found" here would halt a campaign that had
    // actually succeeded. Retry a few times, spaced out, before
    // concluding it's genuinely absent.
    const RETRY_DELAYS_MS = [0, 1000, 2000];
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      const { payment_links } = await this.client.paymentLink.all({ count: 20 });
      const found = payment_links.find((p) => p.reference_id === referenceId);
      if (found) return { id: found.id, shortUrl: found.short_url, status: found.status };
    }
    return null;
  }
}

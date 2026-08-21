import Razorpay from "razorpay";

import type { CreatePaymentLinkInput, PaymentLinkResult, RazorpayGateway } from "@/lib/razorpay/types";

/**
 * Wraps the real Razorpay SDK against TEST MODE credentials only.
 * Not exercised yet in this project — no Razorpay account was available at
 * Phase 12 — but it is code-complete and type-checked. The moment real
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET env vars are set, getRazorpayGateway()
 * (gateway.ts) starts returning this instead of the simulated client, with
 * no other code change required.
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
        contact: input.customerContact ?? undefined,
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
    const { payment_links } = await this.client.paymentLink.all({});
    const found = payment_links.find((p) => p.reference_id === referenceId);
    return found ? { id: found.id, shortUrl: found.short_url, status: found.status } : null;
  }
}

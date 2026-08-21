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
}

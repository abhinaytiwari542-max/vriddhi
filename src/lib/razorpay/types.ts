export type CreatePaymentLinkInput = {
  amountPaise: number;
  currency: "INR";
  customerName: string;
  customerEmail?: string | null;
  customerContact?: string | null;
  description: string;
  /** Our CampaignTarget id — passed through as Razorpay's reference_id for traceability. */
  referenceId: string;
};

export type PaymentLinkResult = {
  id: string;
  shortUrl: string;
  status: "created" | "partially_paid" | "expired" | "cancelled" | "paid";
};

/**
 * One interface, two implementations. getRazorpayGateway() (gateway.ts)
 * picks the real one the moment RAZORPAY_KEY_ID/SECRET are set — nothing
 * else in the codebase needs to change when that happens.
 */
export interface RazorpayGateway {
  readonly mode: "real" | "simulated";
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult>;
}

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
  /**
   * Reconciliation primitive for Phase 14 (failure handling): asks the
   * gateway directly whether a link for this reference actually exists,
   * independent of whatever our own local state currently says. This is
   * what "confirm whether the action completed" means in practice — a
   * network timeout on createPaymentLink does not mean the request never
   * reached Razorpay, so we ask rather than assume.
   */
  findPaymentLinkByReference(referenceId: string): Promise<PaymentLinkResult | null>;
}

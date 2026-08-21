import type { CreatePaymentLinkInput, PaymentLinkResult, RazorpayGateway } from "@/backend/lib/razorpay/types";

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomId(prefix: string, length = 14) {
  let s = "";
  for (let i = 0; i < length; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return `${prefix}_${s}`;
}

/**
 * Stands in for the real Razorpay API when no test-mode account is
 * available (see docs/PHASE-12-RAZORPAY.md for why). Matches the real SDK's
 * request/response shape exactly and simulates realistic network latency,
 * so the rest of the execution pipeline — idempotency, audit logging,
 * status transitions — is genuinely exercised, not mocked away.
 *
 * The short_url is deliberately NOT on a real-looking domain (rzp.io) —
 * it must be obvious to anyone who sees it that this link does not exist
 * and cannot be paid.
 */
export class SimulatedRazorpayGateway implements RazorpayGateway {
  readonly mode = "simulated" as const;

  // In-memory only — resets on server restart. Stands in for "ask
  // Razorpay directly" so reconciliation is a genuine check against
  // gateway-side state, not a call that trivially always says "not found".
  private createdByReference = new Map<string, PaymentLinkResult>();

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400));

    const id = randomId("plink");
    const result: PaymentLinkResult = {
      id,
      shortUrl: `https://simulated-razorpay.invalid/pl/${id}`,
      status: "created",
    };
    this.createdByReference.set(input.referenceId, result);
    return result;
  }

  async findPaymentLinkByReference(referenceId: string): Promise<PaymentLinkResult | null> {
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
    return this.createdByReference.get(referenceId) ?? null;
  }
}

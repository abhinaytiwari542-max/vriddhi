import type { CreatePaymentLinkInput, PaymentLinkResult, RazorpayGateway } from "@/lib/razorpay/types";

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

  async createPaymentLink(_input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400));

    const id = randomId("plink");
    return {
      id,
      shortUrl: `https://simulated-razorpay.invalid/pl/${id}`,
      status: "created",
    };
  }
}

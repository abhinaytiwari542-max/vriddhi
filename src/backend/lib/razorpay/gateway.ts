import { RealRazorpayGateway } from "@/backend/lib/razorpay/real-client";
import { SimulatedRazorpayGateway } from "@/backend/lib/razorpay/simulated-client";
import type { RazorpayGateway } from "@/backend/lib/razorpay/types";

let cached: RazorpayGateway | null = null;

/**
 * The single place that decides real vs. simulated. Everything downstream
 * (campaign execution, audit logs, UI) reads gateway.mode rather than
 * checking env vars itself, so there is exactly one switch to flip later.
 */
export function getRazorpayGateway(): RazorpayGateway {
  if (cached) return cached;

  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  cached =
    RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
      ? new RealRazorpayGateway(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
      : new SimulatedRazorpayGateway();

  return cached;
}

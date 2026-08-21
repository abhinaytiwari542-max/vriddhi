import Razorpay from "razorpay";
import crypto from "crypto";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { reconcilePaymentLinkPaid } from "@/backend/lib/services/webhook-reconciliation";

// ---------------------------------------------------------------------------
// The one shared code path for "a signed Razorpay webhook arrived," used by
// both the real HTTP route (src/app/api/webhooks/razorpay/route.ts) and the
// "simulate customer payment" demo action (campaigns-actions.ts). Same
// reasoning as create_campaign having one handler for both the chat agent
// and the UI button — there is exactly one place that verifies a webhook
// signature, not one per caller.
// ---------------------------------------------------------------------------

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    payment_link?: { entity?: { id?: string; reference_id?: string; amount_paid?: number } };
    payment?: { entity?: { id?: string } };
  };
};

export type WebhookProcessResult = { httpStatus: number; body: Record<string, unknown> };

export async function processRazorpayWebhook(
  rawBody: string,
  signature: string | null
): Promise<WebhookProcessResult> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return { httpStatus: 503, body: { error: "Webhook secret not configured" } };
  }
  if (!signature) {
    return { httpStatus: 400, body: { error: "Missing X-Razorpay-Signature header" } };
  }

  let verified = false;
  try {
    verified = Razorpay.validateWebhookSignature(rawBody, signature, secret);
  } catch {
    verified = false;
  }

  if (!verified) {
    const merchant = await getDemoMerchant();
    if (merchant) {
      await prisma.auditLog.create({
        data: {
          merchantId: merchant.id,
          actor: "RAZORPAY",
          action: "webhook.signature_invalid",
          status: "BLOCKED",
          error: "HMAC-SHA256 signature did not match — request rejected before processing.",
        },
      });
    }
    return { httpStatus: 400, body: { error: "Invalid signature" } };
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, body: { error: "Malformed JSON body" } };
  }

  if (payload.event !== "payment_link.paid") {
    // Signature-verified, just not an event this endpoint reconciles yet.
    // Still a 2xx — Razorpay retries on non-2xx, and there's nothing to
    // fix by retrying an event we deliberately don't act on.
    return { httpStatus: 200, body: { status: "ignored", event: payload.event } };
  }

  const link = payload.payload?.payment_link?.entity;
  const payment = payload.payload?.payment?.entity;
  if (!link?.reference_id || !payment?.id) {
    return { httpStatus: 400, body: { error: "Missing reference_id or payment id in payload" } };
  }

  const result = await reconcilePaymentLinkPaid({
    referenceId: link.reference_id,
    razorpayPaymentId: payment.id,
    amountPaidPaise: link.amount_paid ?? 0,
  });

  return { httpStatus: 200, body: { status: result.status } };
}

/**
 * Builds a real, Razorpay-shaped payment_link.paid payload and a genuine
 * HMAC-SHA256 signature over it — the same computation Razorpay's own
 * servers would do, using the same secret this endpoint verifies against.
 * Used only by the demo "simulate customer payment" action; the route
 * handler above never calls this — it only ever verifies, never signs.
 */
export function signSimulatedPaymentLinkPaidPayload(input: {
  paymentLinkId: string;
  referenceId: string;
  amountPaise: number;
  customerContact?: string | null;
  customerEmail?: string | null;
}): { rawBody: string; signature: string } {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set — cannot sign a simulated webhook.");

  const now = Math.floor(Date.now() / 1000);
  const paymentId = `pay_Simulated${crypto.randomBytes(7).toString("hex")}`;
  const orderId = `order_Simulated${crypto.randomBytes(7).toString("hex")}`;

  const rawBody = JSON.stringify({
    entity: "event",
    account_id: "acc_SimulatedDemo",
    event: "payment_link.paid",
    contains: ["payment_link", "order", "payment"],
    payload: {
      payment_link: {
        entity: {
          id: input.paymentLinkId,
          reference_id: input.referenceId,
          amount: input.amountPaise,
          amount_paid: input.amountPaise,
          currency: "INR",
          status: "paid",
          order_id: orderId,
          short_url: `https://simulated-razorpay.invalid/pl/${input.paymentLinkId}`,
          customer: { contact: input.customerContact ?? null, email: input.customerEmail ?? null },
          created_at: now,
          updated_at: now,
        },
      },
      order: { entity: { id: orderId, amount: input.amountPaise, amount_paid: input.amountPaise, status: "paid" } },
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: input.amountPaise,
          currency: "INR",
          status: "captured",
          captured: true,
          method: "upi",
          order_id: orderId,
          created_at: now,
        },
      },
    },
    created_at: now,
  });

  const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return { rawBody, signature };
}

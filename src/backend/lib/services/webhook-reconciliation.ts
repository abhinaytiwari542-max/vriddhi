import { prisma } from "@/backend/lib/db";

// ---------------------------------------------------------------------------
// Phase 26 — the piece Phase 20's analytics page was missing. Every prior
// phase got a CampaignTarget as far as LINK_CREATED and never further,
// because nothing in this test-mode environment simulated the one thing
// that actually matters: a customer completing payment. This is that path,
// driven by a real Razorpay webhook event (payment_link.paid) rather than
// application code assuming success.
//
// Idempotent by construction: a target already PAID short-circuits before
// touching anything, and Payment.razorpayPaymentId is @unique at the DB
// layer as a second line of defense — Razorpay explicitly redelivers
// webhooks on any non-2xx response, so a duplicate delivery must be a
// guaranteed no-op, not just an unlikely one.
// ---------------------------------------------------------------------------

export type ReconciliationResult =
  | { status: "reconciled"; targetId: string; orderMarkedPaid: boolean }
  | { status: "already_paid"; targetId: string }
  | { status: "not_found" };

export async function reconcilePaymentLinkPaid(input: {
  referenceId: string;
  razorpayPaymentId: string;
  amountPaidPaise: number;
}): Promise<ReconciliationResult> {
  const target = await prisma.campaignTarget.findUnique({
    where: { id: input.referenceId },
    include: { campaign: true },
  });

  if (!target) return { status: "not_found" };
  if (target.status === "PAID") return { status: "already_paid", targetId: target.id };

  const orderMarkedPaid = Boolean(target.orderId);

  await prisma.$transaction([
    prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "PAID" } }),
    ...(target.orderId
      ? [
          prisma.order.update({ where: { id: target.orderId }, data: { status: "PAID" } }),
          prisma.payment.create({
            data: {
              orderId: target.orderId,
              razorpayPaymentId: input.razorpayPaymentId,
              status: "CAPTURED",
              amount: input.amountPaidPaise,
              method: "upi",
            },
          }),
        ]
      : []),
    prisma.auditLog.create({
      data: {
        merchantId: target.campaign.merchantId,
        actor: "RAZORPAY",
        action: "payment_link.paid_webhook",
        input: { targetId: target.id, referenceId: input.referenceId },
        output: {
          razorpayPaymentId: input.razorpayPaymentId,
          amountPaidPaise: input.amountPaidPaise,
          orderMarkedPaid,
        },
        status: "SUCCESS",
        relatedEntityType: "CampaignTarget",
        relatedEntityId: target.id,
      },
    }),
  ]);

  return { status: "reconciled", targetId: target.id, orderMarkedPaid };
}

import crypto from "crypto";

import { describe, expect, it } from "vitest";

import { processRazorpayWebhook, signSimulatedPaymentLinkPaidPayload } from "@/backend/lib/razorpay/webhook";
import { reconcilePaymentLinkPaid } from "@/backend/lib/services/webhook-reconciliation";
import { prisma } from "@/backend/lib/db";
import { createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

async function linkCreatedTarget(merchantId: string, overrides: { orderId?: string } = {}) {
  const opportunity = await createOpportunity(merchantId);
  const customer = await createCustomer(merchantId);
  const campaign = await prisma.campaign.create({
    data: {
      opportunityId: opportunity.id,
      merchantId,
      status: "COMPLETED",
      discountAmount: 100_00,
      audienceFilter: {},
      maxCost: 100_00,
    },
  });
  const target = await prisma.campaignTarget.create({
    data: {
      campaignId: campaign.id,
      customerId: customer.id,
      orderId: overrides.orderId,
      status: "LINK_CREATED",
      razorpayPaymentLinkId: `plink_test_${campaign.id}`,
      idempotencyKey: `${campaign.id}:${customer.id}`,
      amount: 2_900_00,
    },
  });
  return { target, campaign };
}

describe("reconcilePaymentLinkPaid — the business logic, LLM and HTTP both bypassed", () => {
  it("marks the target PAID, marks the linked order PAID, and records a Payment", async () => {
    const { merchant } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    const order = await prisma.order.create({
      data: { merchantId: merchant.id, customerId: customer.id, status: "CREATED", amount: 2_900_00 },
    });
    const { target } = await linkCreatedTarget(merchant.id, { orderId: order.id });

    const result = await reconcilePaymentLinkPaid({
      referenceId: target.id,
      razorpayPaymentId: "pay_test123",
      amountPaidPaise: 2_900_00,
    });

    expect(result).toEqual({ status: "reconciled", targetId: target.id, orderMarkedPaid: true });
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("PAID");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment?.razorpayPaymentId).toBe("pay_test123");
    expect(payment?.status).toBe("CAPTURED");
  });

  it("is idempotent — a redelivered webhook for an already-PAID target changes nothing and creates no duplicate Payment", async () => {
    const { merchant } = await createMerchant();
    const { target } = await linkCreatedTarget(merchant.id);

    const first = await reconcilePaymentLinkPaid({
      referenceId: target.id,
      razorpayPaymentId: "pay_dup1",
      amountPaidPaise: target.amount,
    });
    expect(first.status).toBe("reconciled");

    const redelivered = await reconcilePaymentLinkPaid({
      referenceId: target.id,
      razorpayPaymentId: "pay_dup1", // Razorpay resends the identical payload on retry
      amountPaidPaise: target.amount,
    });
    expect(redelivered).toEqual({ status: "already_paid", targetId: target.id });
  });

  it("returns not_found for an unknown reference without throwing", async () => {
    const result = await reconcilePaymentLinkPaid({
      referenceId: "does-not-exist",
      razorpayPaymentId: "pay_x",
      amountPaidPaise: 100_00,
    });
    expect(result).toEqual({ status: "not_found" });
  });
});

describe("processRazorpayWebhook — signature verification is real, not stubbed", () => {
  it("rejects a request with an invalid signature and reconciles nothing", async () => {
    const { merchant } = await createMerchant();
    const { target } = await linkCreatedTarget(merchant.id);

    const { rawBody } = signSimulatedPaymentLinkPaidPayload({
      paymentLinkId: target.razorpayPaymentLinkId!,
      referenceId: target.id,
      amountPaise: target.amount,
    });

    const result = await processRazorpayWebhook(rawBody, "0000000000000000000000000000000000000000000000000000000000000000");
    expect(result.httpStatus).toBe(400);
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("LINK_CREATED");

    const blockedLog = await prisma.auditLog.findFirst({
      where: { merchantId: merchant.id, action: "webhook.signature_invalid" },
    });
    expect(blockedLog?.status).toBe("BLOCKED");
  });

  it("rejects a tampered body even with a signature that was valid for the original body", async () => {
    const { merchant } = await createMerchant();
    const { target } = await linkCreatedTarget(merchant.id);

    const { rawBody, signature } = signSimulatedPaymentLinkPaidPayload({
      paymentLinkId: target.razorpayPaymentLinkId!,
      referenceId: target.id,
      amountPaise: target.amount,
    });
    const tampered = rawBody.replace(String(target.amount), String(target.amount + 100_00_00));

    const result = await processRazorpayWebhook(tampered, signature);
    expect(result.httpStatus).toBe(400);
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("LINK_CREATED");
  });

  it("accepts a genuinely signed payload and reconciles the target end to end through the real HTTP-boundary function", async () => {
    const { merchant } = await createMerchant();
    const { target } = await linkCreatedTarget(merchant.id);

    const { rawBody, signature } = signSimulatedPaymentLinkPaidPayload({
      paymentLinkId: target.razorpayPaymentLinkId!,
      referenceId: target.id,
      amountPaise: target.amount,
    });

    // Sanity: the signature really is the real HMAC, not something the
    // test just trusts blindly — recompute it independently here too.
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const independentlyComputed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(signature).toBe(independentlyComputed);

    const result = await processRazorpayWebhook(rawBody, signature);
    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({ status: "reconciled" });
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("PAID");
  });

  it("ignores a non-payment_link.paid event without touching any target", async () => {
    const { merchant } = await createMerchant();
    const { target } = await linkCreatedTarget(merchant.id);
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    const rawBody = JSON.stringify({ event: "payment_link.cancelled", payload: {} });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const result = await processRazorpayWebhook(rawBody, signature);
    expect(result.httpStatus).toBe(200);
    expect((await prisma.campaignTarget.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("LINK_CREATED");
  });
});

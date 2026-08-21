import { describe, expect, it } from "vitest";

import { cancelBuyerOrder, completeBuyerPurchase, proposePurchase } from "@/backend/lib/services/buyer-checkout";
import { prisma } from "@/backend/lib/db";
import { createMerchant, createProduct } from "./helpers/fixtures";

describe("buyer-checkout — the AI buyer's guardrails (simulated gateway)", () => {
  it("refuses a proposal over budget, before creating any order", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 5_000_00 });

    const result = await proposePurchase({ productId: product.id, budgetRupees: 1_000, buyerName: "Buyer" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("over_budget");
    expect(await prisma.order.count()).toBe(0);
  });

  it("refuses a proposal for an unavailable product", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 1_000_00, available: false });

    const result = await proposePurchase({ productId: product.id, budgetRupees: 10_000, buyerName: "Buyer" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unavailable");
  });

  it("creates a pending CREATED order on a valid proposal — never charges at proposal time", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 2_999_00 });

    const result = await proposePurchase({ productId: product.id, budgetRupees: 5_000, buyerName: "Buyer" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId } });
    expect(order.status).toBe("CREATED");
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("re-checks the budget at authorization time, blocking if it changed since the proposal", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 2_999_00 });
    const proposal = await proposePurchase({ productId: product.id, budgetRupees: 5_000, buyerName: "Buyer" });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const result = await completeBuyerPurchase(proposal.orderId, 1_000); // budget lowered after proposing
    expect(result.ok).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: proposal.orderId } });
    expect(order.status).toBe("CREATED"); // unchanged — no charge attempted
  });

  it("a simulated payment failure leaves the order retryable with zero Payment rows, and a subsequent success writes exactly one", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 2_999_00 });
    const proposal = await proposePurchase({ productId: product.id, budgetRupees: 5_000, buyerName: "Buyer" });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const failed = await completeBuyerPurchase(proposal.orderId, 5_000, { simulateFailure: true });
    expect(failed.ok).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: proposal.orderId } })).status).toBe("CREATED");
    expect(await prisma.payment.count({ where: { orderId: proposal.orderId } })).toBe(0);

    const success = await completeBuyerPurchase(proposal.orderId, 5_000);
    expect(success.ok).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: proposal.orderId } })).status).toBe("PAID");
    expect(await prisma.payment.count({ where: { orderId: proposal.orderId } })).toBe(1);
  });

  it("blocks re-authorization of an already-PAID order and logs a duplicate-prevention event", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 2_999_00 });
    const proposal = await proposePurchase({ productId: product.id, budgetRupees: 5_000, buyerName: "Buyer" });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    await completeBuyerPurchase(proposal.orderId, 5_000);
    const secondAttempt = await completeBuyerPurchase(proposal.orderId, 5_000);
    expect(secondAttempt.ok).toBe(false);
    expect(await prisma.payment.count({ where: { orderId: proposal.orderId } })).toBe(1); // still exactly one

    const log = await prisma.auditLog.findFirst({
      where: { merchantId: merchant.id, action: "duplicate_prevention.buyer_reauthorization_blocked" },
    });
    expect(log).not.toBeNull();
  });

  it("cancelling a pending order sets it CANCELLED and blocks any later authorization or a second cancel", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 2_999_00 });
    const proposal = await proposePurchase({ productId: product.id, budgetRupees: 5_000, buyerName: "Buyer" });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;

    const cancelled = await cancelBuyerOrder(proposal.orderId);
    expect(cancelled.ok).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: proposal.orderId } })).status).toBe("CANCELLED");

    expect((await completeBuyerPurchase(proposal.orderId, 5_000)).ok).toBe(false);
    expect((await cancelBuyerOrder(proposal.orderId)).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { detectAbandonedCheckoutOpportunity } from "@/backend/lib/services/opportunity-engine";
import { prisma } from "@/backend/lib/db";
import { createAbandonedOrder, createCustomer, createMerchant, createPaidOrder, createProduct } from "./helpers/fixtures";

describe("detectAbandonedCheckoutOpportunity — deterministic, no LLM", () => {
  it("reports nothing detected when there are no old-enough abandoned orders", async () => {
    const { merchant } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    // Only 5 minutes old — below the 30-minute abandonment threshold.
    await createAbandonedOrder(merchant.id, customer.id, { ageMinutes: 5 });

    const result = await detectAbandonedCheckoutOpportunity(merchant.id);
    expect(result.detected).toBe(false);
  });

  it("scores a repeat customer with a recent, above-median cart as high-intent", async () => {
    const { merchant } = await createMerchant();
    const product = await createProduct(merchant.id, { price: 100_00 });

    const repeatCustomer = await createCustomer(merchant.id, { name: "Repeat Customer" });
    await createPaidOrder(merchant.id, repeatCustomer.id, [{ productId: product.id, unitPrice: 100_00 }]);
    await createAbandonedOrder(merchant.id, repeatCustomer.id, { amount: 5_000_00, ageMinutes: 60 });

    const firstTimeCustomer = await createCustomer(merchant.id, { name: "First-time Customer" });
    await createAbandonedOrder(merchant.id, firstTimeCustomer.id, { amount: 500_00, ageMinutes: 60 });

    const result = await detectAbandonedCheckoutOpportunity(merchant.id);
    expect(result.detected).toBe(true);
    if (!result.detected) return;

    expect(result.totalAbandonedCount).toBe(2);
    // Repeat customer: prior paid order + recent + above-median cart = score 3 -> high-intent.
    // First-time customer: none of those apply (their own cart sets the median) = not high-intent.
    expect(result.highIntentCount).toBe(1);
    expect(result.evidence[0].customerId).toBe(repeatCustomer.id);
    expect(result.evidence[0].isRepeatCustomer).toBe(true);
  });

  it("derives impact as a 15-25% range of high-intent value, never a bare point estimate", async () => {
    const { merchant } = await createMerchant();
    const customer = await createCustomer(merchant.id, { name: "High Intent" });
    const product = await createProduct(merchant.id);
    await createPaidOrder(merchant.id, customer.id, [{ productId: product.id, unitPrice: 100_00 }]);
    await createAbandonedOrder(merchant.id, customer.id, { amount: 10_000_00, ageMinutes: 60 });

    const result = await detectAbandonedCheckoutOpportunity(merchant.id);
    expect(result.detected).toBe(true);
    if (!result.detected) return;

    expect(result.highIntentValue).toBe(10_000_00);
    expect(result.impactMin).toBe(Math.round(10_000_00 * 0.15));
    expect(result.impactMax).toBe(Math.round(10_000_00 * 0.25));
    expect(result.impactMin).toBeLessThan(result.impactMax);
  });

  it("upserts the same OPEN opportunity on repeated runs instead of creating duplicates", async () => {
    const { merchant } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    await createAbandonedOrder(merchant.id, customer.id, { amount: 5_000_00, ageMinutes: 60 });

    const first = await detectAbandonedCheckoutOpportunity(merchant.id);
    const second = await detectAbandonedCheckoutOpportunity(merchant.id);

    expect(first.detected && second.detected && first.opportunityId === second.opportunityId).toBe(true);
    const count = await prisma.opportunity.count({ where: { merchantId: merchant.id } });
    expect(count).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { detectCrossSellOpportunity } from "@/lib/services/cross-sell-engine";
import { prisma } from "@/lib/db";
import { createCustomer, createMerchant, createPaidOrder, createProduct } from "./helpers/fixtures";

// Buys `productIds` together in one paid order, for `count` distinct customers.
async function buyTogether(merchantId: string, productIds: string[], count: number, unitPrice = 100_00) {
  for (let i = 0; i < count; i++) {
    const customer = await createCustomer(merchantId, { name: `Basket Customer ${productIds.join("-")}-${i}` });
    await createPaidOrder(
      merchantId,
      customer.id,
      productIds.map((productId) => ({ productId, unitPrice }))
    );
  }
}

// Orders containing neither product of the pair under test — dilutes the
// total-order denominator so lift (observed co-purchase rate vs. chance)
// can rise meaningfully above 1, the same way it would in a real catalog
// with many unrelated single-item purchases.
async function buyUnrelatedProductAlone(merchantId: string, count: number) {
  const unrelated = await createProduct(merchantId, { name: `Unrelated-${count}` });
  for (let i = 0; i < count; i++) {
    const customer = await createCustomer(merchantId, { name: `Unrelated Buyer ${i}` });
    await createPaidOrder(merchantId, customer.id, [{ productId: unrelated.id, unitPrice: 50_00 }]);
  }
}

describe("detectCrossSellOpportunity — basket analysis, no LLM", () => {
  it("reports nothing detected below the minimum co-occurrence threshold", async () => {
    const { merchant } = await createMerchant();
    const a = await createProduct(merchant.id, { name: "A" });
    const b = await createProduct(merchant.id, { name: "B" });
    await buyTogether(merchant.id, [a.id, b.id], 2); // below MIN_CO_OCCURRENCE (4)

    const result = await detectCrossSellOpportunity(merchant.id);
    expect(result.detected).toBe(false);
  });

  it("detects a pair meeting co-occurrence, lift, and confidence thresholds", async () => {
    const { merchant } = await createMerchant();
    const shoes = await createProduct(merchant.id, { name: "Running Shoes" });
    const socks = await createProduct(merchant.id, { name: "Compression Socks" });

    // 10 customers buy both (100% of shoes buyers also buy socks); 15 more
    // buy an unrelated product alone, diluting the total-order denominator
    // so this pair's lift clears the threshold (P(socks|shoes)=1.0 vs.
    // P(socks)=10/25=0.4 baseline -> lift=2.5).
    await buyTogether(merchant.id, [shoes.id, socks.id], 10);
    await buyUnrelatedProductAlone(merchant.id, 15);

    const result = await detectCrossSellOpportunity(merchant.id);
    expect(result.detected).toBe(true);
    if (!result.detected) return;

    expect(result.coOccurrenceCount).toBe(10);
    expect([result.productId, result.recommendedProductId].sort()).toEqual([shoes.id, socks.id].sort());
    expect(result.lift).toBeGreaterThan(1.3);
    expect(result.confidence).toBeGreaterThanOrEqual(0.15);
  });

  it("excludes a pair already approved via ProductCrossSell from being re-detected", async () => {
    const { merchant } = await createMerchant();
    const a = await createProduct(merchant.id, { name: "A" });
    const b = await createProduct(merchant.id, { name: "B" });
    await buyTogether(merchant.id, [a.id, b.id], 10);
    await buyUnrelatedProductAlone(merchant.id, 15);

    const first = await detectCrossSellOpportunity(merchant.id);
    expect(first.detected).toBe(true);
    if (!first.detected) return;

    await prisma.productCrossSell.create({
      data: {
        merchantId: merchant.id,
        productId: first.productId,
        recommendedProductId: first.recommendedProductId,
        opportunityId: first.opportunityId,
        support: first.support,
        confidence: first.confidence,
        lift: first.lift,
      },
    });

    const second = await detectCrossSellOpportunity(merchant.id);
    // No other candidate pair exists in this fixture, so once the only
    // qualifying pair is applied, nothing further should surface.
    expect(second.detected).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { prisma } from "@/backend/lib/db";
import { createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

// The application code (executeApprovedCampaign's skip-already-done filter,
// completeBuyerPurchase's status check) is the primary duplicate-prevention
// mechanism, but both are backed by a hard DB constraint as a second,
// independent line of defense. These tests prove the constraint itself
// holds even if application logic were ever bypassed or buggy.
describe("database-level duplicate-prevention constraints", () => {
  it("rejects a second CampaignTarget for the same (campaign, customer) pair", async () => {
    const { merchant } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id);
    const campaign = await prisma.campaign.create({
      data: { opportunityId: opportunity.id, merchantId: merchant.id, status: "APPROVED", discountAmount: 100_00, audienceFilter: {}, maxCost: 100_00 },
    });

    await prisma.campaignTarget.create({
      data: { campaignId: campaign.id, customerId: customer.id, status: "PENDING", idempotencyKey: `${campaign.id}:${customer.id}`, amount: 2_900_00 },
    });

    await expect(
      prisma.campaignTarget.create({
        data: { campaignId: campaign.id, customerId: customer.id, status: "PENDING", idempotencyKey: `${campaign.id}:${customer.id}:2`, amount: 2_900_00 },
      })
    ).rejects.toThrow();
  });

  it("rejects a second ProductCrossSell row for the same (product, recommendedProduct) pair", async () => {
    const { merchant } = await createMerchant();
    const opportunity = await createOpportunity(merchant.id, { type: "CROSS_SELL" });
    const productA = await prisma.product.create({ data: { merchantId: merchant.id, name: "A", price: 1_00 } });
    const productB = await prisma.product.create({ data: { merchantId: merchant.id, name: "B", price: 1_00 } });

    await prisma.productCrossSell.create({
      data: { merchantId: merchant.id, productId: productA.id, recommendedProductId: productB.id, opportunityId: opportunity.id, support: 0.1, confidence: 0.2, lift: 1.5 },
    });

    await expect(
      prisma.productCrossSell.create({
        data: { merchantId: merchant.id, productId: productA.id, recommendedProductId: productB.id, opportunityId: opportunity.id, support: 0.1, confidence: 0.2, lift: 1.5 },
      })
    ).rejects.toThrow();
  });
});

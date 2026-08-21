import { describe, expect, it } from "vitest";

import { prisma } from "@/backend/lib/db";
import { draftCustomCampaign } from "@/backend/lib/services/custom-campaign";
import {
  createAbandonedOrder,
  createCustomer,
  createMerchant,
  createOpportunity,
} from "./helpers/fixtures";

// ---------------------------------------------------------------------------
// The campaign builder lets a merchant choose the discount and the audience,
// which the agent's create_campaign tool deliberately cannot. That makes the
// browser the place where the numbers originate, and the browser is not a
// trust boundary — the live preview in the UI is a convenience, and every
// rule it shows has to hold again on the server against a request that never
// went through it. These tests send exactly the requests a tampered client
// would send.
// ---------------------------------------------------------------------------

async function setupOpportunity(options: { customers: number; cartValue?: number }) {
  const { merchant } = await createMerchant();
  // createMerchant() already seeds a Policy row, so tighten the existing
  // one rather than inserting a second (merchantId is unique).
  await prisma.policy.update({
    where: { merchantId: merchant.id },
    data: {
      maxCampaignBudget: 500_00, // ₹500
      maxDiscountPercent: 20,
      maxTransactionValue: 200_00, // ₹200
    },
  });

  const evidence: { orderId: string; customerId: string; amount: number }[] = [];
  for (let i = 0; i < options.customers; i++) {
    const customer = await createCustomer(merchant.id, { name: `Customer ${i}` });
    const amount = options.cartValue ?? 5_000_00;
    const order = await createAbandonedOrder(merchant.id, customer.id, { amount });
    evidence.push({ orderId: order.id, customerId: customer.id, amount });
  }

  const opportunity = await createOpportunity(merchant.id, {
    evidence,
    estimatedCost: 100_00 * options.customers,
    recommendedAction: {
      type: "recovery_discount_campaign",
      audienceCount: options.customers,
      discountPerCustomer: 100_00,
      targetCustomerIds: evidence.map((e) => e.customerId),
    },
  });

  return { merchant, opportunity, evidence };
}

describe("custom campaign — happy path", () => {
  it("uses the merchant's chosen discount and audience, not the engine's defaults", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 4 });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00, // ₹50, deliberately different from the engine's ₹100
      customerIds: evidence.slice(0, 2).map((e) => e.customerId),
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") return;
    expect(result.audienceCount).toBe(2);
    expect(result.maxCost).toBe(100_00); // ₹50 × 2

    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: result.campaignId },
      include: { targets: true },
    });
    expect(campaign.discountAmount).toBe(50_00);
    expect(campaign.maxCost).toBe(100_00);
    expect(campaign.targets).toHaveLength(2);
    expect(campaign.status).toBe("DRAFT");
  });

  it("charges each customer their cart value minus the discount", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({
      customers: 1,
      cartValue: 3_000_00,
    });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 100_00,
      customerIds: [evidence[0].customerId],
    });
    expect(result.status).toBe("drafted");

    const target = await prisma.campaignTarget.findFirstOrThrow({});
    expect(target.amount).toBe(2_900_00);
  });

  it("records that the audience was hand-picked, and by whom", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 3 });

    await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[0].customerId],
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "campaign.drafted_custom" },
    });
    expect(log.actor).toBe("MERCHANT");
    expect(log.status).toBe("SUCCESS");
    expect(log.input).toMatchObject({ audienceCount: 1, candidateCount: 3, discountPaise: 50_00 });
  });
});

describe("custom campaign — the server re-checks every limit the UI showed", () => {
  it("blocks a total cost over the budget even though the UI would have hidden the button", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 6 });

    // ₹100 × 6 = ₹600, over the ₹500 budget.
    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 100_00,
      customerIds: evidence.map((e) => e.customerId),
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.rule).toMatch(/budget/i);
    expect(await prisma.campaign.count()).toBe(0);
    expect(await prisma.campaignTarget.count()).toBe(0);
  });

  it("blocks a per-customer discount over the transaction cap", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 1 });

    // ₹250 > ₹200 cap, while total cost stays under the budget.
    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 250_00,
      customerIds: [evidence[0].customerId],
    });

    expect(result.status).toBe("blocked");
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("blocks a discount that is too large a share of the cart", async () => {
    // ₹150 on a ₹500 cart is 30%, over the 20% cap, while clearing both
    // the budget and the per-transaction limits — so only the percentage
    // rule can catch it.
    const { merchant, opportunity, evidence } = await setupOpportunity({
      customers: 1,
      cartValue: 500_00,
    });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 150_00,
      customerIds: [evidence[0].customerId],
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.rule).toMatch(/percent/i);
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("writes a BLOCKED audit row attributed to the merchant", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 6 });

    await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 100_00,
      customerIds: evidence.map((e) => e.customerId),
    });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { status: "BLOCKED" } });
    expect(log.actor).toBe("MERCHANT");
    expect(log.action).toBe("campaign.blocked");
  });
});

describe("custom campaign — audience cannot be forged", () => {
  it("refuses a customer who is not in this opportunity's evidence", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 2 });
    const outsider = await createCustomer(merchant.id, { name: "Not in evidence" });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[0].customerId, outsider.id],
    });

    // Rejected wholesale rather than quietly dropping the bad id, so a
    // tampered request never produces a campaign that merely looks right.
    expect(result.status).toBe("error");
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("refuses another merchant's opportunity", async () => {
    const victim = await setupOpportunity({ customers: 2 });
    const { merchant: attacker } = await createMerchant();

    const result = await draftCustomCampaign(attacker.id, {
      opportunityId: victim.opportunity.id,
      discountPaise: 50_00,
      customerIds: victim.evidence.map((e) => e.customerId),
    });

    expect(result.status).toBe("error");
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("rejects a zero or negative discount at the schema layer", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 1 });

    for (const discountPaise of [0, -5_000]) {
      const result = await draftCustomCampaign(merchant.id, {
        opportunityId: opportunity.id,
        discountPaise,
        customerIds: [evidence[0].customerId],
      });
      expect(result.status).toBe("error");
    }
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("rejects an empty audience", async () => {
    const { merchant, opportunity } = await setupOpportunity({ customers: 2 });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [],
    });
    expect(result.status).toBe("error");
  });

  it("counts a duplicated customer id only once", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 2 });

    const result = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[0].customerId, evidence[0].customerId],
    });

    expect(result.status).toBe("drafted");
    if (result.status !== "drafted") return;
    // Deduplicated before costing, so a repeated id cannot inflate the
    // spend or violate the unique constraint on CampaignTarget.
    expect(result.audienceCount).toBe(1);
    expect(result.maxCost).toBe(50_00);
    expect(await prisma.campaignTarget.count()).toBe(1);
  });
});

describe("custom campaign — one live campaign per opportunity", () => {
  it("refuses while another campaign is still in flight", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 3 });

    const first = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[0].customerId],
    });
    expect(first.status).toBe("drafted");

    const second = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[1].customerId],
    });
    expect(second.status).toBe("error");
    expect(await prisma.campaign.count()).toBe(1);
  });

  it("allows a new campaign once the previous one is finished", async () => {
    const { merchant, opportunity, evidence } = await setupOpportunity({ customers: 3 });

    const first = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[0].customerId],
    });
    if (first.status !== "drafted") throw new Error("expected first draft to succeed");

    await prisma.campaign.update({
      where: { id: first.campaignId },
      data: { status: "COMPLETED" },
    });

    // This is the regression the Opportunities page had: a finished campaign
    // must not block the next one.
    const second = await draftCustomCampaign(merchant.id, {
      opportunityId: opportunity.id,
      discountPaise: 50_00,
      customerIds: [evidence[1].customerId],
    });
    expect(second.status).toBe("drafted");
    expect(await prisma.campaign.count()).toBe(2);
  });
});

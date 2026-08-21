import { describe, expect, it } from "vitest";

import { runTool } from "@/backend/lib/ai/tool-runner";
import { prisma } from "@/backend/lib/db";
import { createAbandonedOrder, createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

describe("runTool — the single chokepoint every tool call passes through", () => {
  it("logs and rejects an unknown tool name without touching the DB otherwise", async () => {
    const { merchant } = await createMerchant();
    const result = await runTool(merchant.id, "SYSTEM", "delete_everything", {});
    expect(result.ok).toBe(false);

    const logged = await prisma.agentAction.findFirst({ where: { merchantId: merchant.id, toolName: "delete_everything" } });
    expect(logged?.status).toBe("error");
  });

  it("rejects malformed input against the tool's own Zod schema before the handler ever runs", async () => {
    const { merchant } = await createMerchant();
    // create_payment_order requires amountRupees >= 1 — send a negative number.
    const result = await runTool(merchant.id, "CHAT", "create_payment_order", {
      customerId: "whatever",
      amountRupees: -50,
    });
    expect(result.ok).toBe(false);

    const logged = await prisma.agentAction.findFirst({ where: { merchantId: merchant.id, toolName: "create_payment_order" } });
    expect(logged?.status).toBe("error");
  });

  it("always writes an AgentAction row, success or failure, for every tool call", async () => {
    const { merchant } = await createMerchant();
    await runTool(merchant.id, "CHAT", "get_orders", { limit: 5 });
    expect(await prisma.agentAction.count({ where: { merchantId: merchant.id, toolName: "get_orders" } })).toBe(1);
  });
});

describe("create_campaign — cannot be steered by model-supplied numbers", () => {
  it("ignores any discount/cost fields smuggled into the input and only reads them from the Opportunity row", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 500_000 });
    const customer = await createCustomer(merchant.id);
    const order = await createAbandonedOrder(merchant.id, customer.id, { amount: 3_000_00 });
    const opportunity = await createOpportunity(merchant.id, {
      evidence: [{ orderId: order.id, customerId: customer.id, amount: 3_000_00 }],
      recommendedAction: {
        type: "recovery_discount_campaign",
        audienceCount: 1,
        discountPerCustomer: 100_00, // ₹100 — the ONLY number that should ever be used
        targetCustomerIds: [customer.id],
      },
      estimatedCost: 100_00,
    });

    // A hostile/hallucinating model tries to smuggle its own discount and cost.
    const result = await runTool(merchant.id, "CHAT", "create_campaign", {
      opportunityId: opportunity.id,
      discountPerCustomer: 999_999_00,
      maxCost: 999_999_00,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const campaignId = (result.output as { campaignId: string }).campaignId;
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

    // Real values came from the Opportunity, not the smuggled input.
    expect(campaign.discountAmount).toBe(100_00);
    expect(campaign.maxCost).toBe(100_00);
  });

  it("blocks by policy and creates zero campaign rows when the opportunity's cost exceeds the limit", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 1_00 }); // ₹1
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, {
      evidence: [{ orderId: "ord_1", customerId: customer.id, amount: 3_000_00 }],
      recommendedAction: {
        type: "recovery_discount_campaign",
        audienceCount: 1,
        discountPerCustomer: 100_00,
        targetCustomerIds: [customer.id],
      },
      estimatedCost: 100_00,
    });

    const result = await runTool(merchant.id, "CHAT", "create_campaign", { opportunityId: opportunity.id });
    expect(result.ok).toBe(true); // runTool succeeded; the tool's own output reports "blocked"
    if (!result.ok) return;
    expect((result.output as { status: string }).status).toBe("blocked");
    expect(await prisma.campaign.count({ where: { merchantId: merchant.id } })).toBe(0);
  });
});

describe("create_payment_order — unconditionally refuses, structurally", () => {
  it("never creates a payment regardless of input, since Razorpay execution requires the Approval+Campaign path", async () => {
    const { merchant } = await createMerchant();
    const result = await runTool(merchant.id, "CHAT", "create_payment_order", {
      customerId: "any-customer",
      amountRupees: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.output as { status: string }).status).toBe("blocked");
    expect(await prisma.payment.count()).toBe(0);
  });
});

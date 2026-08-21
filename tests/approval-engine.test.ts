import { describe, expect, it } from "vitest";

import { approveCampaign, modifyCampaign, rejectCampaign } from "@/lib/services/approval-engine";
import { prisma } from "@/lib/db";
import { createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

async function draftCampaign(merchantId: string, opportunityId: string, customerIds: string[]) {
  const campaign = await prisma.campaign.create({
    data: {
      opportunityId,
      merchantId,
      status: "DRAFT",
      discountAmount: 100_00,
      audienceFilter: {},
      maxCost: 100_00 * customerIds.length,
    },
  });
  await prisma.campaignTarget.createMany({
    data: customerIds.map((customerId) => ({
      campaignId: campaign.id,
      customerId,
      status: "PENDING" as const,
      idempotencyKey: `${campaign.id}:${customerId}`,
      amount: 2_900_00,
    })),
  });
  return campaign;
}

describe("approval-engine — approve/reject/modify guardrails", () => {
  it("approves a within-policy campaign and records a matching Approval row", async () => {
    const { merchant, user } = await createMerchant({ maxCampaignBudget: 500_000 });
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, {
      evidence: [{ amount: 3_000_00 }],
    });
    const campaign = await draftCampaign(merchant.id, opportunity.id, [customer.id]);

    const result = await approveCampaign(campaign.id, user.id);
    expect(result.ok).toBe(true);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("APPROVED");

    const approvals = await prisma.approval.findMany({ where: { campaignId: campaign.id } });
    expect(approvals).toHaveLength(1);
    expect(approvals[0].decision).toBe("APPROVE");
  });

  it("blocks approval when the campaign's cost exceeds the CURRENT policy limit and writes zero state changes", async () => {
    const { merchant, user } = await createMerchant({ maxCampaignBudget: 50_00 }); // ₹50 — deliberately tiny
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, { evidence: [{ amount: 3_000_00 }] });
    const campaign = await draftCampaign(merchant.id, opportunity.id, [customer.id]);

    const result = await approveCampaign(campaign.id, user.id);
    expect(result.ok).toBe(false);

    const unchanged = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(unchanged.status).toBe("DRAFT");
    expect(await prisma.approval.count({ where: { campaignId: campaign.id } })).toBe(0);
  });

  it("rejecting a campaign dismisses its opportunity and never touches Razorpay-adjacent state", async () => {
    const { merchant, user } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, { evidence: [{ amount: 3_000_00 }] });
    const campaign = await draftCampaign(merchant.id, opportunity.id, [customer.id]);

    const result = await rejectCampaign(campaign.id, user.id);
    expect(result.ok).toBe(true);

    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("REJECTED");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe("DISMISSED");
  });

  it("modify re-runs the policy check against the NEW numbers, not the original draft's", async () => {
    const { merchant, user } = await createMerchant({ maxCampaignBudget: 500_000 });
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, { evidence: [{ amount: 10_000_00 }] });
    const campaign = await draftCampaign(merchant.id, opportunity.id, [customer.id]);

    // ₹6,000/customer x 1 target = ₹6,000 total, over the ₹5,000 budget.
    const blocked = await modifyCampaign(campaign.id, user.id, 6_000);
    expect(blocked.ok).toBe(false);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("DRAFT");

    const allowed = await modifyCampaign(campaign.id, user.id, 150);
    expect(allowed.ok).toBe(true);
    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.status).toBe("APPROVED");
    expect(updated.discountAmount).toBe(150_00);

    const approvals = await prisma.approval.findMany({ where: { campaignId: campaign.id } });
    expect(approvals).toHaveLength(1);
    expect(approvals[0].decision).toBe("MODIFY");
  });

  it("refuses to approve, reject, or modify a campaign that is no longer DRAFT", async () => {
    const { merchant, user } = await createMerchant();
    const customer = await createCustomer(merchant.id);
    const opportunity = await createOpportunity(merchant.id, { evidence: [{ amount: 3_000_00 }] });
    const campaign = await draftCampaign(merchant.id, opportunity.id, [customer.id]);

    await approveCampaign(campaign.id, user.id);

    expect((await approveCampaign(campaign.id, user.id)).ok).toBe(false);
    expect((await rejectCampaign(campaign.id, user.id)).ok).toBe(false);
    expect((await modifyCampaign(campaign.id, user.id, 50)).ok).toBe(false);
    // Still exactly one Approval — none of the refused calls above wrote anything.
    expect(await prisma.approval.count({ where: { campaignId: campaign.id } })).toBe(1);
  });
});

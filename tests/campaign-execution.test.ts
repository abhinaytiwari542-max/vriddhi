import { describe, expect, it } from "vitest";

import { executeApprovedCampaign } from "@/backend/lib/services/campaign-execution";
import { prisma } from "@/backend/lib/db";
import { createCustomer, createMerchant, createOpportunity } from "./helpers/fixtures";

async function approvedCampaign(merchantId: string, targetCount: number) {
  const opportunity = await createOpportunity(merchantId, { evidence: [{ amount: 3_000_00 }] });
  const campaign = await prisma.campaign.create({
    data: {
      opportunityId: opportunity.id,
      merchantId,
      status: "APPROVED",
      discountAmount: 100_00,
      audienceFilter: {},
      maxCost: 100_00 * targetCount,
    },
  });
  const customers = await Promise.all(
    Array.from({ length: targetCount }, (_, i) => createCustomer(merchantId, { name: `Target ${i}` }))
  );
  await prisma.campaignTarget.createMany({
    data: customers.map((c) => ({
      campaignId: campaign.id,
      customerId: c.id,
      status: "PENDING" as const,
      idempotencyKey: `${campaign.id}:${c.id}`,
      amount: 2_900_00,
    })),
  });
  return campaign;
}

describe("executeApprovedCampaign — the sole Razorpay-gateway chokepoint (simulated mode)", () => {
  it("refuses to execute a campaign that isn't APPROVED or HALTED", async () => {
    const { merchant } = await createMerchant();
    const opportunity = await createOpportunity(merchant.id, { evidence: [{ amount: 3_000_00 }] });
    const draft = await prisma.campaign.create({
      data: { opportunityId: opportunity.id, merchantId: merchant.id, status: "DRAFT", discountAmount: 100_00, audienceFilter: {}, maxCost: 100_00 },
    });

    const result = await executeApprovedCampaign(draft.id);
    expect(result.ok).toBe(false);
  });

  it("creates one payment link per target and completes the campaign", async () => {
    const { merchant } = await createMerchant();
    const campaign = await approvedCampaign(merchant.id, 5);

    const result = await executeApprovedCampaign(campaign.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(5);
    expect(result.halted).toBe(false);
    expect(result.mode).toBe("simulated");

    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("COMPLETED");
    const linked = await prisma.campaignTarget.count({ where: { campaignId: campaign.id, status: "LINK_CREATED" } });
    expect(linked).toBe(5);
  });

  it("halts at the injected failure index, leaving later targets untouched, and a retry finishes only the remainder without duplicating earlier links", async () => {
    const { merchant } = await createMerchant();
    const campaign = await approvedCampaign(merchant.id, 6);

    const halted = await executeApprovedCampaign(campaign.id, { simulateFailureAtIndex: 3 });
    expect(halted.ok).toBe(true);
    if (!halted.ok) return;
    expect(halted.halted).toBe(true);
    expect(halted.created).toBe(3);

    const afterHalt = await prisma.campaignTarget.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: "asc" } });
    expect(afterHalt.filter((t) => t.status === "LINK_CREATED")).toHaveLength(3);
    expect(afterHalt.filter((t) => t.status === "FAILED")).toHaveLength(1);
    expect(afterHalt.filter((t) => t.status === "PENDING")).toHaveLength(2);
    const linksBeforeRetry = afterHalt
      .filter((t) => t.status === "LINK_CREATED")
      .map((t) => t.razorpayPaymentLinkId);

    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("HALTED");
    expect(await prisma.failure.count({ where: { campaignId: campaign.id } })).toBe(1);

    const retried = await executeApprovedCampaign(campaign.id);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    // Only the remaining 3 (the FAILED one + 2 PENDING) are pending-eligible;
    // exact split across succeed/fail on retry isn't asserted, only totals.
    expect(retried.alreadyDone).toBe(3);

    const afterRetry = await prisma.campaignTarget.findMany({ where: { campaignId: campaign.id } });
    const linksAfterRetry = afterRetry
      .filter((t) => t.razorpayPaymentLinkId && linksBeforeRetry.includes(t.razorpayPaymentLinkId))
      .map((t) => t.razorpayPaymentLinkId);
    // Every link created before the halt is byte-for-byte unchanged after retry.
    expect(linksAfterRetry.sort()).toEqual(linksBeforeRetry.sort());

    const duplicateLog = await prisma.auditLog.findFirst({
      where: { merchantId: merchant.id, action: "duplicate_prevention.campaign_targets_skipped" },
    });
    expect(duplicateLog).not.toBeNull();
    expect((duplicateLog?.output as { skippedCount?: number })?.skippedCount).toBe(3);
  });

  it("re-runs the policy check at execution time and blocks even an already-approved campaign if limits tightened since", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 500_000 });
    const campaign = await approvedCampaign(merchant.id, 5); // maxCost = 500_00

    await prisma.policy.update({ where: { merchantId: merchant.id }, data: { maxCampaignBudget: 10_00 } });

    const result = await executeApprovedCampaign(campaign.id);
    expect(result.ok).toBe(false);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("APPROVED");
    expect(await prisma.campaignTarget.count({ where: { campaignId: campaign.id, status: "LINK_CREATED" } })).toBe(0);
  });
});

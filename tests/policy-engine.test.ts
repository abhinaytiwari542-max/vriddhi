import { describe, expect, it } from "vitest";

import { evaluatePolicy } from "@/lib/services/policy-engine";
import { prisma } from "@/lib/db";
import { createMerchant } from "./helpers/fixtures";

describe("evaluatePolicy — deterministic guardrail, no LLM involved", () => {
  it("passes an action within every limit", async () => {
    const { merchant } = await createMerchant({
      maxCampaignBudget: 500_000,
      maxTransactionValue: 200_000,
      maxDiscountPercent: 20,
    });

    const result = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 100_000,
      perTransactionPaise: 10_000,
      discountPercent: 5,
    });

    expect(result.verdict).toBe("PASS");
  });

  it("blocks on campaign budget, reporting the exact requested/limit figures", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 100_000 });

    const result = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 264_000,
      perTransactionPaise: 12_000,
      discountPercent: 5,
    });

    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict === "BLOCKED") {
      expect(result.rule).toBe("Maximum campaign budget");
      expect(result.requested).toContain("2,640");
      expect(result.limit).toContain("1,000");
    }
  });

  it("blocks on per-transaction value independently of campaign budget", async () => {
    const { merchant } = await createMerchant({
      maxCampaignBudget: 5_000_000,
      maxTransactionValue: 50_000,
    });

    const result = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 100_000,
      perTransactionPaise: 60_000,
      discountPercent: 5,
    });

    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict === "BLOCKED") expect(result.rule).toBe("Maximum transaction value");
  });

  it("blocks on discount percentage independently of the paise amounts", async () => {
    const { merchant } = await createMerchant({ maxDiscountPercent: 10 });

    const result = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 1_000,
      perTransactionPaise: 100,
      discountPercent: 25,
    });

    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict === "BLOCKED") expect(result.rule).toBe("Maximum discount percentage");
  });

  it("blocks unconditionally when no policy row exists for the merchant", async () => {
    const merchant = await prisma.merchant.create({ data: { name: "No-policy merchant" } });

    const result = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 1,
      perTransactionPaise: 1,
      discountPercent: 0,
    });

    expect(result.verdict).toBe("BLOCKED");
  });

  it("checks against the merchant's CURRENT limits, not a cached snapshot", async () => {
    const { merchant } = await createMerchant({ maxCampaignBudget: 500_000 });

    const before = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 300_000,
      perTransactionPaise: 1_000,
      discountPercent: 5,
    });
    expect(before.verdict).toBe("PASS");

    await prisma.policy.update({ where: { merchantId: merchant.id }, data: { maxCampaignBudget: 100_000 } });

    const after = await evaluatePolicy(merchant.id, {
      campaignCostPaise: 300_000,
      perTransactionPaise: 1_000,
      discountPercent: 5,
    });
    expect(after.verdict).toBe("BLOCKED");
  });
});

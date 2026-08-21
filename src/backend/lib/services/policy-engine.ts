import { prisma } from "@/backend/lib/db";
import { formatInr } from "@/backend/lib/services/opportunity-engine";

// ---------------------------------------------------------------------------
// Deterministic guardrail engine — Phase 10.
//
// No LLM involvement whatsoever. Every proposed money action is evaluated
// against the merchant's CURRENT stored limits at the moment of the check —
// never against numbers the model supplied, never against a cached policy.
// This is called from both the live UI (Opportunities/Campaigns) and from
// inside the create_campaign tool itself, so there is no path to a Razorpay
// call that skips it.
// ---------------------------------------------------------------------------

export type ProposedAction = {
  /** Total money the merchant would be exposed to across the whole campaign. */
  campaignCostPaise: number;
  /** Money exposed per individual customer (e.g. the discount given). */
  perTransactionPaise: number;
  /** The discount as a percentage of a typical targeted cart value. */
  discountPercent: number;
};

export type PolicyCheckResult =
  | { verdict: "PASS" }
  | {
      verdict: "BLOCKED";
      rule: string;
      requested: string;
      limit: string;
    };

export async function evaluatePolicy(
  merchantId: string,
  action: ProposedAction
): Promise<PolicyCheckResult> {
  const policy = await prisma.policy.findUnique({ where: { merchantId } });

  if (!policy) {
    return {
      verdict: "BLOCKED",
      rule: "No policy configured for this merchant",
      requested: "any action",
      limit: "none set",
    };
  }

  if (action.campaignCostPaise > policy.maxCampaignBudget) {
    return {
      verdict: "BLOCKED",
      rule: "Maximum campaign budget",
      requested: formatInr(action.campaignCostPaise),
      limit: formatInr(policy.maxCampaignBudget),
    };
  }

  if (action.perTransactionPaise > policy.maxTransactionValue) {
    return {
      verdict: "BLOCKED",
      rule: "Maximum transaction value",
      requested: formatInr(action.perTransactionPaise),
      limit: formatInr(policy.maxTransactionValue),
    };
  }

  if (action.discountPercent > policy.maxDiscountPercent) {
    return {
      verdict: "BLOCKED",
      rule: "Maximum discount percentage",
      requested: `${action.discountPercent.toFixed(1)}%`,
      limit: `${policy.maxDiscountPercent}%`,
    };
  }

  return { verdict: "PASS" };
}

export async function getOrCreatePolicy(merchantId: string) {
  const existing = await prisma.policy.findUnique({ where: { merchantId } });
  if (existing) return existing;
  return prisma.policy.create({
    data: {
      merchantId,
      maxCampaignBudget: 500_000, // ₹5,000
      maxDiscountPercent: 20,
      maxTransactionValue: 200_000, // ₹2,000
      requireApprovalAlways: true,
      autoExecuteEnabled: false,
    },
  });
}

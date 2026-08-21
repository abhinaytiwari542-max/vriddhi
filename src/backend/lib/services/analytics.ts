import { prisma } from "@/backend/lib/db";

// ---------------------------------------------------------------------------
// Phase 20 — Analytics. Phase 26 closed the gap this comment used to
// describe: incremental GMV and recovery rate needed a CampaignTarget to
// reach PAID, which required a real customer action nothing simulated
// until the Phase 26 webhook + "simulate customer payment" pipeline
// existed. Now that PAID is a real, reachable status (via a genuinely
// signature-verified webhook, not a shortcut), these compute for real
// once at least one target has actually been paid — and still honestly
// report `measured: false` before that, rather than showing a zero that
// could be mistaken for "measured, and it's zero."
// ---------------------------------------------------------------------------

type Measured<T> = { measured: true; value: T } | { measured: false; reason: string };

export type AnalyticsSnapshot = {
  merchant: {
    gmv: number;
    totalOrders: number;
    paidOrders: number;
    aov: number;
    conversionPercent: number;
    repeatCustomers: number;
  };
  ai: {
    opportunitiesDetected: number;
    recommendationsAccepted: number;
    recommendationsRejected: number;
    actionsExecuted: number;
    executionSuccessRate: Measured<number>;
    agentInterventionRate: Measured<number>;
  };
  financialSafety: {
    totalMoneyActions: number;
    approvedActions: number;
    blockedActions: number;
    failedActions: number;
    duplicatePreventionEvents: number;
  };
  businessImpact: {
    campaignCost: number;
    incrementalGmv: Measured<number>;
    recoveryRate: Measured<number>;
    roi: Measured<number>;
    designedRecoveryEstimate: { impactMin: number; impactMax: number } | null;
  };
};

const ACCEPTED_CAMPAIGN_STATUSES = ["APPROVED", "EXECUTING", "COMPLETED", "HALTED"] as const;
const EXECUTED_CAMPAIGN_STATUSES = ["COMPLETED", "HALTED"] as const;

export async function getAnalyticsSnapshot(merchantId: string): Promise<AnalyticsSnapshot> {
  const [
    totalOrders,
    paidOrders,
    paidAggregate,
    repeatCustomerGroups,
    opportunitiesDetected,
    acceptedCampaigns,
    rejectedCampaigns,
    actionedCrossSells,
    dismissedCrossSellOpportunities,
    executedCampaigns,
    completedCampaigns,
    approvals,
    modifyApprovals,
    campaignTargetCount,
    buyerProposedCount,
    approvedApprovals,
    buyerAuthorizedCount,
    blockedAuditCount,
    failedAuditCount,
    duplicateCampaignLogs,
    duplicateBuyerCount,
    campaignsWithCreatedTargets,
    openAbandonedOpportunity,
    paidTargetsAggregate,
    sentTargetsCount,
  ] = await Promise.all([
    prisma.order.count({ where: { merchantId } }),
    prisma.order.count({ where: { merchantId, status: "PAID" } }),
    prisma.order.aggregate({ where: { merchantId, status: "PAID" }, _sum: { amount: true } }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: { merchantId, status: "PAID" },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }),
    prisma.opportunity.count({ where: { merchantId } }),
    prisma.campaign.count({ where: { merchantId, status: { in: [...ACCEPTED_CAMPAIGN_STATUSES] } } }),
    prisma.campaign.count({ where: { merchantId, status: "REJECTED" } }),
    prisma.opportunity.count({ where: { merchantId, type: "CROSS_SELL", status: "ACTIONED" } }),
    prisma.opportunity.count({ where: { merchantId, type: "CROSS_SELL", status: "DISMISSED" } }),
    prisma.campaign.count({ where: { merchantId, status: { in: [...EXECUTED_CAMPAIGN_STATUSES] } } }),
    prisma.campaign.count({ where: { merchantId, status: "COMPLETED" } }),
    prisma.approval.count({ where: { campaign: { merchantId } } }),
    prisma.approval.count({ where: { campaign: { merchantId }, decision: "MODIFY" } }),
    prisma.campaignTarget.count({ where: { campaign: { merchantId } } }),
    prisma.auditLog.count({ where: { merchantId, action: "buyer.purchase_proposed" } }),
    prisma.approval.count({ where: { campaign: { merchantId }, decision: { in: ["APPROVE", "MODIFY"] } } }),
    prisma.auditLog.count({ where: { merchantId, action: "buyer.purchase_authorized" } }),
    prisma.auditLog.count({ where: { merchantId, status: "BLOCKED" } }),
    prisma.auditLog.count({
      where: { merchantId, action: { in: ["payment_link.failed", "buyer.payment_failed"] } },
    }),
    prisma.auditLog.findMany({
      where: { merchantId, action: "duplicate_prevention.campaign_targets_skipped" },
      select: { output: true },
    }),
    prisma.auditLog.count({
      where: { merchantId, action: "duplicate_prevention.buyer_reauthorization_blocked" },
    }),
    prisma.campaign.findMany({
      where: { merchantId },
      select: {
        discountAmount: true,
        targets: { where: { status: { in: ["LINK_CREATED", "PAID"] } }, select: { id: true } },
      },
    }),
    prisma.opportunity.findFirst({
      where: { merchantId, type: "ABANDONED_CHECKOUT", status: "OPEN" },
      select: { impactMin: true, impactMax: true },
    }),
    prisma.campaignTarget.aggregate({
      where: { campaign: { merchantId }, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.campaignTarget.count({
      where: { campaign: { merchantId }, status: { in: ["LINK_CREATED", "PAID"] } },
    }),
  ]);

  const gmv = paidAggregate._sum.amount ?? 0;
  const aov = paidOrders > 0 ? gmv / paidOrders : 0;
  const conversionPercent = totalOrders > 0 ? (paidOrders / totalOrders) * 100 : 0;

  const executedTotal = executedCampaigns; // cross-sell has no failure mode once approved
  const executionSuccessRate: Measured<number> =
    executedTotal > 0
      ? { measured: true, value: (completedCampaigns / executedTotal) * 100 }
      : { measured: false, reason: "No campaign has reached execution yet." };

  const agentInterventionRate: Measured<number> =
    approvals > 0
      ? { measured: true, value: (modifyApprovals / approvals) * 100 }
      : { measured: false, reason: "No approval decisions recorded yet." };

  const duplicateCampaignSkips = duplicateCampaignLogs.reduce((sum, row) => {
    const out = row.output as { skippedCount?: number } | null;
    return sum + (out?.skippedCount ?? 1);
  }, 0);

  // Cost actually committed so far: the per-customer discount, times how
  // many payment links reached that customer — NOT the link amounts
  // themselves (those are the customer's discounted cart total, i.e. what
  // they'd pay, which is closer to potential recovered GMV than to cost).
  const campaignCost = campaignsWithCreatedTargets.reduce(
    (sum, c) => sum + c.discountAmount * c.targets.length,
    0
  );

  const paidTargetCount = paidTargetsAggregate._count;
  const incrementalGmvPaise = paidTargetsAggregate._sum.amount ?? 0;

  const incrementalGmv: Measured<number> =
    paidTargetCount > 0
      ? { measured: true, value: incrementalGmvPaise }
      : {
          measured: false,
          reason:
            "No customer has completed payment on a recovery link yet. Use \"Simulate customer payment\" on a completed campaign's payment links (Campaigns page) to generate this via a real, signature-verified webhook.",
        };

  const recoveryRate: Measured<number> =
    sentTargetsCount > 0
      ? { measured: true, value: (paidTargetCount / sentTargetsCount) * 100 }
      : { measured: false, reason: "No payment links have been sent yet." };

  const roi: Measured<number> =
    incrementalGmv.measured && campaignCost > 0
      ? { measured: true, value: (incrementalGmv.value / campaignCost) * 100 }
      : {
          measured: false,
          reason: !incrementalGmv.measured
            ? "ROI depends on incremental GMV, which is not yet measurable (see above)."
            : "No campaign cost has been committed yet, so ROI has no meaningful denominator.",
        };

  return {
    merchant: {
      gmv,
      totalOrders,
      paidOrders,
      aov,
      conversionPercent,
      repeatCustomers: repeatCustomerGroups.length,
    },
    ai: {
      opportunitiesDetected,
      recommendationsAccepted: acceptedCampaigns + actionedCrossSells,
      recommendationsRejected: rejectedCampaigns + dismissedCrossSellOpportunities,
      actionsExecuted: executedCampaigns,
      executionSuccessRate,
      agentInterventionRate,
    },
    financialSafety: {
      totalMoneyActions: campaignTargetCount + buyerProposedCount,
      approvedActions: approvedApprovals + buyerAuthorizedCount,
      blockedActions: blockedAuditCount,
      failedActions: failedAuditCount,
      duplicatePreventionEvents: duplicateCampaignSkips + duplicateBuyerCount,
    },
    businessImpact: {
      campaignCost,
      incrementalGmv,
      recoveryRate,
      roi,
      designedRecoveryEstimate: openAbandonedOpportunity
        ? { impactMin: openAbandonedOpportunity.impactMin, impactMax: openAbandonedOpportunity.impactMax }
        : null,
    },
  };
}

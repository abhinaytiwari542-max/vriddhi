import { prisma } from "@/backend/lib/db";
import { evaluatePolicy } from "@/backend/lib/services/policy-engine";

type EvidenceRow = { amount: number };

type CampaignStateSnapshot = {
  status: string;
  discountAmount: number;
  maxCost: number;
  audienceCount: number;
};

export type ApprovalActionResult = { ok: true } | { ok: false; error: string };

async function snapshotCampaign(campaignId: string): Promise<CampaignStateSnapshot> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { targets: true },
  });
  return {
    status: campaign.status,
    discountAmount: campaign.discountAmount,
    maxCost: campaign.maxCost,
    audienceCount: campaign.targets.length,
  };
}

function averageCartValue(evidence: EvidenceRow[]) {
  return evidence.reduce((sum, e) => sum + e.amount, 0) / Math.max(evidence.length, 1);
}

/**
 * Every decision re-runs the deterministic policy check against the
 * merchant's CURRENT limits — not the limits at draft time — per the
 * Phase 3 defense-in-depth design. An approval can still be blocked if
 * limits were tightened after the campaign was drafted.
 */
export async function approveCampaign(
  campaignId: string,
  actorUserId: string
): Promise<ApprovalActionResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { opportunity: true, targets: true },
  });
  if (campaign.status !== "DRAFT") {
    return { ok: false, error: "This campaign is no longer awaiting approval." };
  }

  const previousState = await snapshotCampaign(campaignId);
  const evidence = campaign.opportunity.evidence as unknown as EvidenceRow[];
  const discountPercent = (campaign.discountAmount / averageCartValue(evidence)) * 100;

  const policyCheck = await evaluatePolicy(campaign.merchantId, {
    campaignCostPaise: campaign.maxCost,
    perTransactionPaise: campaign.discountAmount,
    discountPercent,
  });
  if (policyCheck.verdict === "BLOCKED") {
    await prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "MERCHANT",
        action: "campaign.approval_blocked",
        input: previousState,
        output: policyCheck,
        status: "BLOCKED",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
        error: `${policyCheck.rule}: requested ${policyCheck.requested}, limit is ${policyCheck.limit}`,
      },
    });
    return {
      ok: false,
      error: `Blocked by policy: ${policyCheck.rule} — requested ${policyCheck.requested}, limit is ${policyCheck.limit}.`,
    };
  }

  await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaignId }, data: { status: "APPROVED" } }),
    prisma.approval.create({
      data: {
        campaignId,
        actorUserId,
        decision: "APPROVE",
        previousState,
        approvedState: previousState,
      },
    }),
    prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "MERCHANT",
        action: "campaign.approved",
        input: previousState,
        output: previousState,
        status: "SUCCESS",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
      },
    }),
  ]);

  return { ok: true };
}

export async function rejectCampaign(
  campaignId: string,
  actorUserId: string
): Promise<ApprovalActionResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== "DRAFT") {
    return { ok: false, error: "This campaign is no longer awaiting approval." };
  }

  const previousState = await snapshotCampaign(campaignId);

  await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaignId }, data: { status: "REJECTED" } }),
    prisma.opportunity.update({
      where: { id: campaign.opportunityId },
      data: { status: "DISMISSED" },
    }),
    prisma.approval.create({
      data: {
        campaignId,
        actorUserId,
        decision: "REJECT",
        previousState,
        approvedState: previousState,
      },
    }),
    prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "MERCHANT",
        action: "campaign.rejected",
        input: previousState,
        output: previousState,
        status: "SUCCESS",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
      },
    }),
  ]);

  return { ok: true };
}

export async function modifyCampaign(
  campaignId: string,
  actorUserId: string,
  newDiscountRupees: number
): Promise<ApprovalActionResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { opportunity: true, targets: true },
  });
  if (campaign.status !== "DRAFT") {
    return { ok: false, error: "This campaign is no longer awaiting approval." };
  }

  const previousState = await snapshotCampaign(campaignId);
  const newDiscountPaise = Math.round(newDiscountRupees * 100);
  const newMaxCost = newDiscountPaise * campaign.targets.length;

  const evidence = campaign.opportunity.evidence as unknown as EvidenceRow[];
  const discountPercent = (newDiscountPaise / averageCartValue(evidence)) * 100;

  const policyCheck = await evaluatePolicy(campaign.merchantId, {
    campaignCostPaise: newMaxCost,
    perTransactionPaise: newDiscountPaise,
    discountPercent,
  });
  if (policyCheck.verdict === "BLOCKED") {
    await prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "MERCHANT",
        action: "campaign.modify_blocked",
        input: { ...previousState, requestedDiscountAmount: newDiscountPaise },
        output: policyCheck,
        status: "BLOCKED",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
        error: `${policyCheck.rule}: requested ${policyCheck.requested}, limit is ${policyCheck.limit}`,
      },
    });
    return {
      ok: false,
      error: `Blocked by policy: ${policyCheck.rule} — requested ${policyCheck.requested}, limit is ${policyCheck.limit}.`,
    };
  }

  const approvedState: CampaignStateSnapshot = {
    ...previousState,
    discountAmount: newDiscountPaise,
    maxCost: newMaxCost,
  };

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "APPROVED", discountAmount: newDiscountPaise, maxCost: newMaxCost },
    }),
    ...campaign.targets.map((target) => {
      const originalCartValue = target.amount + campaign.discountAmount;
      const newAmount = Math.max(originalCartValue - newDiscountPaise, 0);
      return prisma.campaignTarget.update({
        where: { id: target.id },
        data: { amount: newAmount },
      });
    }),
    prisma.approval.create({
      data: {
        campaignId,
        actorUserId,
        decision: "MODIFY",
        previousState,
        approvedState,
      },
    }),
    prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "MERCHANT",
        action: "campaign.modified",
        input: previousState,
        output: approvedState,
        status: "SUCCESS",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
      },
    }),
  ]);

  return { ok: true };
}

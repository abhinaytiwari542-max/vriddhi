import { prisma } from "@/lib/db";
import { evaluatePolicy } from "@/lib/services/policy-engine";
import { getRazorpayGateway } from "@/lib/razorpay/gateway";

type EvidenceRow = { amount: number };

export type ExecutionResult =
  | { ok: true; created: number; alreadyDone: number; failed: number; mode: "real" | "simulated" }
  | { ok: false; error: string };

/**
 * The sole chokepoint that can call the Razorpay gateway. No tool, no
 * agent, no UI action reaches Razorpay any other way. Re-runs the
 * deterministic policy check a third time (draft -> approval -> here)
 * against current limits, and processes targets one at a time — sequential
 * on purpose, so a mid-run failure (Phase 14) has a well-defined "N of M
 * done" boundary rather than a scattered parallel result. Already-processed
 * targets (LINK_CREATED/PAID) are skipped, so re-running this on a
 * partially-executed campaign is always safe.
 */
export async function executeApprovedCampaign(campaignId: string): Promise<ExecutionResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { targets: { include: { customer: true } }, opportunity: true },
  });

  if (campaign.status !== "APPROVED") {
    return { ok: false, error: "Campaign is not approved for execution." };
  }

  const evidence = campaign.opportunity.evidence as unknown as EvidenceRow[];
  const averageCartValue = evidence.reduce((sum, e) => sum + e.amount, 0) / Math.max(evidence.length, 1);
  const discountPercent = (campaign.discountAmount / averageCartValue) * 100;

  const policyCheck = await evaluatePolicy(campaign.merchantId, {
    campaignCostPaise: campaign.maxCost,
    perTransactionPaise: campaign.discountAmount,
    discountPercent,
  });
  if (policyCheck.verdict === "BLOCKED") {
    return {
      ok: false,
      error: `Blocked by policy at execution time: ${policyCheck.rule} — requested ${policyCheck.requested}, limit is ${policyCheck.limit}.`,
    };
  }

  const gateway = getRazorpayGateway();

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "EXECUTING" } });
  await prisma.auditLog.create({
    data: {
      merchantId: campaign.merchantId,
      actor: "SYSTEM",
      action: "campaign.execution.started",
      input: { campaignId },
      output: { gatewayMode: gateway.mode },
      status: "SUCCESS",
      relatedEntityType: "Campaign",
      relatedEntityId: campaignId,
    },
  });

  let created = 0;
  let alreadyDone = 0;
  let failed = 0;

  for (const target of campaign.targets) {
    if (target.status === "LINK_CREATED" || target.status === "PAID") {
      alreadyDone++;
      continue;
    }

    try {
      const link = await gateway.createPaymentLink({
        amountPaise: target.amount,
        currency: "INR",
        customerName: target.customer.name,
        customerEmail: target.customer.email,
        customerContact: target.customer.phone,
        description: `Vriddhi recovery offer${gateway.mode === "simulated" ? " (SIMULATED — no real charge)" : ""}`,
        referenceId: target.id,
      });

      await prisma.campaignTarget.update({
        where: { id: target.id },
        data: { status: "LINK_CREATED", razorpayPaymentLinkId: link.id },
      });
      await prisma.auditLog.create({
        data: {
          merchantId: campaign.merchantId,
          actor: "RAZORPAY",
          action: "payment_link.created",
          input: { targetId: target.id, amount: target.amount },
          output: { paymentLinkId: link.id, shortUrl: link.shortUrl, mode: gateway.mode },
          status: "SUCCESS",
          relatedEntityType: "CampaignTarget",
          relatedEntityId: target.id,
        },
      });
      created++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "FAILED" } });
      await prisma.auditLog.create({
        data: {
          merchantId: campaign.merchantId,
          actor: "RAZORPAY",
          action: "payment_link.failed",
          input: { targetId: target.id },
          output: { error: message },
          status: "FAILURE",
          relatedEntityType: "CampaignTarget",
          relatedEntityId: target.id,
        },
      });
    }
  }

  const finalStatus = failed > 0 ? "HALTED" : "COMPLETED";
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: finalStatus } });
  await prisma.auditLog.create({
    data: {
      merchantId: campaign.merchantId,
      actor: "SYSTEM",
      action: "campaign.execution.finished",
      input: { campaignId },
      output: { created, alreadyDone, failed, finalStatus },
      status: failed > 0 ? "FAILURE" : "SUCCESS",
      relatedEntityType: "Campaign",
      relatedEntityId: campaignId,
    },
  });

  return { ok: true, created, alreadyDone, failed, mode: gateway.mode };
}

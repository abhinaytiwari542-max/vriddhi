import { prisma } from "@/backend/lib/db";
import { evaluatePolicy } from "@/backend/lib/services/policy-engine";
import { getRazorpayGateway } from "@/backend/lib/razorpay/gateway";

type EvidenceRow = { amount: number };

export type ExecutionOptions = {
  /**
   * Demo/test only — forces a simulated timeout on the Nth target
   * processed in this run (0-indexed among pending targets), so the
   * failure-handling flow (Phase 14) can be shown on demand instead of
   * waiting for a real, non-reproducible failure. Never has any effect
   * against the real gateway in production use — it's a parameter this
   * service accepts, not something the gateway itself knows about.
   */
  simulateFailureAtIndex?: number;
};

export type ExecutionResult =
  | {
      ok: true;
      created: number;
      alreadyDone: number;
      halted: boolean;
      haltReason?: string;
      remaining: number;
      mode: "real" | "simulated";
    }
  | { ok: false; error: string };

/**
 * The sole chokepoint that can call the Razorpay gateway. Re-runs the
 * deterministic policy check a third time (draft -> approval -> here), then
 * processes pending targets one at a time, IN ORDER, and STOPS at the first
 * failure rather than continuing past it — a timeout on target N tells us
 * nothing about whether N+1 would have succeeded, so we don't guess.
 *
 * On failure, reconciles with the gateway directly (findPaymentLinkByReference)
 * before concluding anything — a network timeout does not prove the
 * request never reached Razorpay. Only once reconciliation confirms
 * nothing was created do we mark the target FAILED and halt; if it turns
 * out the link *was* created despite the error, we record that instead and
 * keep going, no duplicate created either way.
 *
 * Already-processed targets (LINK_CREATED/PAID) are always skipped, so
 * calling this again on a HALTED campaign is a safe, scoped retry of only
 * the remaining targets — not a special "retry" code path, just the same
 * function.
 */
export async function executeApprovedCampaign(
  campaignId: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { targets: { include: { customer: true } }, opportunity: true },
  });

  if (campaign.status !== "APPROVED" && campaign.status !== "HALTED") {
    return { ok: false, error: "Campaign is not in a state that can be executed." };
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
    await prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "SYSTEM",
        action: "campaign.execution_blocked",
        input: { campaignId },
        output: policyCheck,
        status: "BLOCKED",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
        error: `${policyCheck.rule}: requested ${policyCheck.requested}, limit is ${policyCheck.limit}`,
      },
    });
    return {
      ok: false,
      error: `Blocked by policy at execution time: ${policyCheck.rule} — requested ${policyCheck.requested}, limit is ${policyCheck.limit}.`,
    };
  }

  const gateway = getRazorpayGateway();
  const pendingTargets = campaign.targets.filter(
    (t) => t.status !== "LINK_CREATED" && t.status !== "PAID"
  );
  const alreadyDone = campaign.targets.length - pendingTargets.length;

  if (alreadyDone > 0) {
    await prisma.auditLog.create({
      data: {
        merchantId: campaign.merchantId,
        actor: "SYSTEM",
        action: "duplicate_prevention.campaign_targets_skipped",
        input: { campaignId },
        output: { skippedCount: alreadyDone },
        status: "SUCCESS",
        relatedEntityType: "Campaign",
        relatedEntityId: campaignId,
      },
    });
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "EXECUTING" } });
  await prisma.auditLog.create({
    data: {
      merchantId: campaign.merchantId,
      actor: "SYSTEM",
      action: "campaign.execution.started",
      input: { campaignId, pendingCount: pendingTargets.length },
      output: { gatewayMode: gateway.mode },
      status: "SUCCESS",
      relatedEntityType: "Campaign",
      relatedEntityId: campaignId,
    },
  });

  let created = 0;
  let haltReason: string | undefined;

  for (let i = 0; i < pendingTargets.length; i++) {
    const target = pendingTargets[i];

    try {
      if (options.simulateFailureAtIndex === i) {
        throw new Error("Payment service timeout (simulated for demo).");
      }

      // Check-before-create: ask Razorpay directly whether a link already
      // exists for this reference before ever calling create. Razorpay's
      // Payment Links API has no request-level idempotency header (unlike
      // their Payouts API, which does) — a client-generated reference_id
      // looked up via findPaymentLinkByReference is the actual supported
      // mechanism. Checking it here, not just after a failure, protects
      // against our own DB state being stale or restored from an older
      // snapshot, not only against a failed network call.
      const existing = await gateway.findPaymentLinkByReference(target.id);
      const link = existing ?? (await gateway.createPaymentLink({
        amountPaise: target.amount,
        currency: "INR",
        customerName: target.customer.name,
        customerEmail: target.customer.email,
        customerContact: target.customer.phone,
        description: `Vriddhi recovery offer${gateway.mode === "simulated" ? " (SIMULATED — no real charge)" : ""}`,
        referenceId: target.id,
      }));

      await prisma.campaignTarget.update({
        where: { id: target.id },
        data: { status: "LINK_CREATED", razorpayPaymentLinkId: link.id },
      });
      await prisma.auditLog.create({
        data: {
          merchantId: campaign.merchantId,
          actor: "RAZORPAY",
          action: existing ? "payment_link.found_existing" : "payment_link.created",
          input: { targetId: target.id, amount: target.amount },
          output: { paymentLinkId: link.id, shortUrl: link.shortUrl, mode: gateway.mode },
          status: "SUCCESS",
          relatedEntityType: "CampaignTarget",
          relatedEntityId: target.id,
        },
      });
      created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.auditLog.create({
        data: {
          merchantId: campaign.merchantId,
          actor: "RAZORPAY",
          action: "payment_link.failed",
          input: { targetId: target.id },
          status: "FAILURE",
          relatedEntityType: "CampaignTarget",
          relatedEntityId: target.id,
          error: message,
        },
      });

      // Reconciliation — ask the gateway directly rather than assume the
      // timeout means nothing happened.
      const reconciled = await gateway.findPaymentLinkByReference(target.id);
      await prisma.auditLog.create({
        data: {
          merchantId: campaign.merchantId,
          actor: "SYSTEM",
          action: "payment_link.reconciled",
          input: { targetId: target.id },
          output: { foundOnGateway: Boolean(reconciled) },
          status: "SUCCESS",
          relatedEntityType: "CampaignTarget",
          relatedEntityId: target.id,
        },
      });

      if (reconciled) {
        // It actually went through despite the client-side error — record
        // it as created (no duplicate risk: we never call createPaymentLink
        // again for a target that's already LINK_CREATED) and keep going.
        await prisma.campaignTarget.update({
          where: { id: target.id },
          data: { status: "LINK_CREATED", razorpayPaymentLinkId: reconciled.id },
        });
        created++;
        continue;
      }

      // Confirmed: nothing was created. Halt — do not touch the remaining
      // targets this run.
      await prisma.campaignTarget.update({ where: { id: target.id }, data: { status: "FAILED" } });
      await prisma.failure.create({
        data: {
          campaignId,
          failedAtTargetId: target.id,
          reason: message,
          reconciliationResult: { foundOnGateway: false },
        },
      });
      haltReason = message;
      break;
    }
  }

  const remaining = pendingTargets.length - created - (haltReason ? 1 : 0);
  const finalStatus = haltReason ? "HALTED" : "COMPLETED";

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: finalStatus } });
  await prisma.auditLog.create({
    data: {
      merchantId: campaign.merchantId,
      actor: "SYSTEM",
      action: haltReason ? "campaign.execution.halted" : "campaign.execution.finished",
      input: { campaignId },
      output: { created, alreadyDone, remaining, finalStatus },
      status: haltReason ? "FAILURE" : "SUCCESS",
      relatedEntityType: "Campaign",
      relatedEntityId: campaignId,
      error: haltReason,
    },
  });

  return {
    ok: true,
    created,
    alreadyDone,
    halted: Boolean(haltReason),
    haltReason,
    remaining,
    mode: gateway.mode,
  };
}

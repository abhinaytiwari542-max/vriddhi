"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant, getDemoUser } from "@/backend/lib/demo-merchant";
import {
  approveCampaign,
  modifyCampaign,
  rejectCampaign,
  type ApprovalActionResult,
} from "@/backend/lib/services/approval-engine";
import { executeApprovedCampaign, type ExecutionResult } from "@/backend/lib/services/campaign-execution";
import { processRazorpayWebhook, signSimulatedPaymentLinkPaidPayload } from "@/backend/lib/razorpay/webhook";

async function actorOrError(): Promise<{ actorUserId: string } | { error: string }> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { error: "No merchant found." };
  const user = await getDemoUser(merchant.id);
  if (!user) return { error: "No user found for this merchant." };
  return { actorUserId: user.id };
}

function revalidateAll() {
  revalidatePath("/campaigns");
  revalidatePath("/opportunities");
  revalidatePath("/audit");
}

export async function approveCampaignAction(campaignId: string): Promise<ApprovalActionResult> {
  const actor = await actorOrError();
  if ("error" in actor) return { ok: false, error: actor.error };

  const result = await approveCampaign(campaignId, actor.actorUserId);
  if (result.ok) revalidateAll();
  return result;
}

export async function rejectCampaignAction(campaignId: string): Promise<ApprovalActionResult> {
  const actor = await actorOrError();
  if ("error" in actor) return { ok: false, error: actor.error };

  const result = await rejectCampaign(campaignId, actor.actorUserId);
  if (result.ok) revalidateAll();
  return result;
}

export async function modifyCampaignAction(
  campaignId: string,
  newDiscountRupees: number
): Promise<ApprovalActionResult> {
  const actor = await actorOrError();
  if ("error" in actor) return { ok: false, error: actor.error };

  const result = await modifyCampaign(campaignId, actor.actorUserId, newDiscountRupees);
  if (result.ok) revalidateAll();
  return result;
}

export async function executeCampaignAction(
  campaignId: string,
  simulateFailure = false
): Promise<ExecutionResult> {
  let simulateFailureAtIndex: number | undefined;
  if (simulateFailure) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { targets: true },
    });
    const pendingCount =
      campaign?.targets.filter((t) => t.status !== "LINK_CREATED" && t.status !== "PAID").length ?? 0;
    // Fail partway through, not on the very first target — a demo where
    // nothing succeeded first would be less convincing than "10 of 22 done,
    // then it stopped."
    simulateFailureAtIndex = Math.max(1, Math.floor(pendingCount / 2));
  }

  const result = await executeApprovedCampaign(campaignId, { simulateFailureAtIndex });
  revalidateAll();
  return result;
}

export async function retryCampaignAction(campaignId: string): Promise<ExecutionResult> {
  const result = await executeApprovedCampaign(campaignId);
  revalidateAll();
  return result;
}

export type SimulatePaymentResult = { ok: true; status: string } | { ok: false; error: string };

/**
 * Demo-only, Phase 26: constructs a real Razorpay-shaped payment_link.paid
 * webhook payload, signs it with the real HMAC secret, and runs it through
 * the exact same processRazorpayWebhook() the live /api/webhooks/razorpay
 * route calls — signature verification genuinely happens, nothing about
 * that path is skipped. Only the origination (a button click instead of
 * Razorpay's servers) is simulated, same pattern as the payment gateway
 * itself. This is what turns a LINK_CREATED target into PAID, and is the
 * only thing that can — nothing else in the codebase sets that status.
 */
export async function simulateCustomerPaymentAction(campaignTargetId: string): Promise<SimulatePaymentResult> {
  const target = await prisma.campaignTarget.findUnique({ where: { id: campaignTargetId } });
  if (!target) return { ok: false, error: "Target not found." };
  if (target.status !== "LINK_CREATED") {
    return { ok: false, error: `Target is ${target.status}, not LINK_CREATED — nothing to pay.` };
  }
  if (!target.razorpayPaymentLinkId) {
    return { ok: false, error: "Target has no payment link id." };
  }

  const { rawBody, signature } = signSimulatedPaymentLinkPaidPayload({
    paymentLinkId: target.razorpayPaymentLinkId,
    referenceId: target.id,
    amountPaise: target.amount,
  });

  const { httpStatus, body } = await processRazorpayWebhook(rawBody, signature);
  if (httpStatus !== 200) {
    return { ok: false, error: `Webhook processing failed: ${JSON.stringify(body)}` };
  }

  revalidateAll();
  revalidatePath("/analytics");
  revalidatePath("/overview");
  return { ok: true, status: String((body as { status?: string }).status ?? "unknown") };
}

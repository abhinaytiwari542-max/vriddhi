"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getDemoMerchant, getDemoUser } from "@/lib/demo-merchant";
import {
  approveCampaign,
  modifyCampaign,
  rejectCampaign,
  type ApprovalActionResult,
} from "@/lib/services/approval-engine";
import { executeApprovedCampaign, type ExecutionResult } from "@/lib/services/campaign-execution";

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

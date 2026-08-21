"use server";

import { revalidatePath } from "next/cache";

import { getDemoMerchant, getDemoUser } from "@/lib/demo-merchant";
import {
  approveCampaign,
  modifyCampaign,
  rejectCampaign,
  type ApprovalActionResult,
} from "@/lib/services/approval-engine";

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

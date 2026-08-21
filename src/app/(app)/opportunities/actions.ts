"use server";

import { revalidatePath } from "next/cache";

import { getDemoMerchant, getDemoUser } from "@/lib/demo-merchant";
import { createCampaign } from "@/lib/ai/tools/propose-tools";
import {
  approveCrossSell,
  rejectCrossSell,
  type CrossSellDecisionResult,
} from "@/lib/services/cross-sell-approval";

/**
 * Lets a merchant draft a campaign straight from the Opportunities page,
 * without needing the (not-yet-built, Phase 15) chat interface. Calls the
 * exact same tool handler the agent uses — same policy check, same
 * guarantees — so there is only one code path for "propose a campaign",
 * not a UI-only shortcut that skips the guardrail.
 */
export async function draftCampaignAction(opportunityId: string) {
  const merchant = await getDemoMerchant();
  if (!merchant) return { status: "error" as const, message: "No merchant found." };

  const result = await createCampaign.handler(merchant.id, { opportunityId });
  revalidatePath("/opportunities");
  revalidatePath("/campaigns");
  return result as {
    status: "drafted" | "blocked" | "already_drafted" | "error";
    message?: string;
    campaignId?: string;
  };
}

export async function approveCrossSellAction(opportunityId: string): Promise<CrossSellDecisionResult> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { ok: false, error: "No merchant found." };
  const user = await getDemoUser(merchant.id);
  if (!user) return { ok: false, error: "No user found." };

  const result = await approveCrossSell(opportunityId, user.id);
  if (result.ok) {
    revalidatePath("/opportunities");
    revalidatePath("/audit");
  }
  return result;
}

export async function rejectCrossSellAction(opportunityId: string): Promise<CrossSellDecisionResult> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { ok: false, error: "No merchant found." };
  const user = await getDemoUser(merchant.id);
  if (!user) return { ok: false, error: "No user found." };

  const result = await rejectCrossSell(opportunityId, user.id);
  if (result.ok) {
    revalidatePath("/opportunities");
    revalidatePath("/audit");
  }
  return result;
}

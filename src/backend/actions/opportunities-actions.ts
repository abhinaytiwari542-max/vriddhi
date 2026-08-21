"use server";

import { revalidatePath } from "next/cache";

import { getDemoMerchant, getDemoUser } from "@/backend/lib/demo-merchant";
import { createCampaign } from "@/backend/lib/ai/tools/propose-tools";
import {
  draftCustomCampaign,
  type CustomCampaignResult,
} from "@/backend/lib/services/custom-campaign";
import {
  approveCrossSell,
  rejectCrossSell,
  type CrossSellDecisionResult,
} from "@/backend/lib/services/cross-sell-approval";

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

/**
 * Merchant-authored campaign draft. Deliberately a server action rather
 * than an agent tool — see custom-campaign.ts for why choosing the numbers
 * is the merchant's prerogative and not the model's.
 */
export async function draftCustomCampaignAction(input: {
  opportunityId: string;
  discountPaise: number;
  customerIds: string[];
}): Promise<CustomCampaignResult> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { status: "error", message: "No merchant found." };

  const result = await draftCustomCampaign(merchant.id, input);
  if (result.status === "drafted") {
    revalidatePath("/opportunities");
    revalidatePath("/campaigns");
    revalidatePath("/audit");
  }
  return result;
}

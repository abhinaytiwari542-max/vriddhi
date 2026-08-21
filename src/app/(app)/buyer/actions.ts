"use server";

import { revalidatePath } from "next/cache";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { runBuyerAgentQuery, type BuyerAgentResult } from "@/lib/ai/buyer-agent";
import { completeBuyerPurchase, type PurchaseCompletionResult } from "@/lib/services/buyer-checkout";

export async function sendBuyerMessage(
  message: string,
  budgetRupees: number,
  buyerName: string,
  buyerEmail: string
): Promise<BuyerAgentResult> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { ok: false, reason: "api_error", trace: [] };

  return runBuyerAgentQuery(merchant.id, message, {
    budgetRupees,
    buyerName: buyerName || "Demo Buyer",
    buyerEmail: buyerEmail || undefined,
  });
}

export async function authorizePurchaseAction(
  orderId: string,
  budgetRupees: number
): Promise<PurchaseCompletionResult> {
  const result = await completeBuyerPurchase(orderId, budgetRupees);
  if (result.ok) {
    revalidatePath("/audit");
    revalidatePath("/overview");
  }
  return result;
}

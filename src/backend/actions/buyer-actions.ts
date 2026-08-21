"use server";

import { revalidatePath } from "next/cache";

import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { runBuyerAgentQuery, type BuyerAgentResult } from "@/backend/lib/ai/buyer-agent";
import {
  cancelBuyerOrder,
  completeBuyerPurchase,
  type CancelResult,
  type PurchaseCompletionResult,
} from "@/backend/lib/services/buyer-checkout";

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
  budgetRupees: number,
  simulateFailure = false
): Promise<PurchaseCompletionResult> {
  const result = await completeBuyerPurchase(orderId, budgetRupees, { simulateFailure });
  if (result.ok) {
    revalidatePath("/audit");
    revalidatePath("/overview");
  }
  return result;
}

export async function cancelOrderAction(orderId: string): Promise<CancelResult> {
  const result = await cancelBuyerOrder(orderId);
  if (result.ok) revalidatePath("/audit");
  return result;
}

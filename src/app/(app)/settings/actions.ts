"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getDemoMerchant } from "@/lib/demo-merchant";

const PolicyFormSchema = z.object({
  maxCampaignBudget: z.coerce.number().min(0),
  maxDiscountPercent: z.coerce.number().min(0).max(100),
  maxTransactionValue: z.coerce.number().min(0),
  requireApprovalAlways: z.coerce.boolean(),
  autoExecuteEnabled: z.coerce.boolean(),
});

export async function updatePolicy(formData: FormData): Promise<void> {
  const merchant = await getDemoMerchant();
  if (!merchant) return;

  const parsed = PolicyFormSchema.safeParse({
    maxCampaignBudget: formData.get("maxCampaignBudget"),
    maxDiscountPercent: formData.get("maxDiscountPercent"),
    maxTransactionValue: formData.get("maxTransactionValue"),
    requireApprovalAlways: formData.get("requireApprovalAlways") === "on",
    autoExecuteEnabled: formData.get("autoExecuteEnabled") === "on",
  });

  if (!parsed.success) return;

  await prisma.policy.update({
    where: { merchantId: merchant.id },
    data: {
      maxCampaignBudget: Math.round(parsed.data.maxCampaignBudget * 100),
      maxDiscountPercent: Math.round(parsed.data.maxDiscountPercent),
      maxTransactionValue: Math.round(parsed.data.maxTransactionValue * 100),
      requireApprovalAlways: parsed.data.requireApprovalAlways,
      autoExecuteEnabled: parsed.data.autoExecuteEnabled,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/opportunities");
  revalidatePath("/overview");
}

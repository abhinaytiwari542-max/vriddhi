"use server";

import { getDemoMerchant } from "@/lib/demo-merchant";
import { runAgentQuery, type AgentResult, type ChatTurn } from "@/lib/ai/agent";

export async function sendAgentMessage(message: string, history: ChatTurn[]): Promise<AgentResult> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { ok: false, reason: "api_error", trace: [] };

  return runAgentQuery(merchant.id, message, history);
}

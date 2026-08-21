import {
  calculateCampaignCost,
  getAbandonedCheckouts,
  getCustomers,
  getOrders,
  getPaymentStatus,
  getProducts,
} from "@/lib/ai/tools/read-tools";
import { createCampaign, createPaymentOrder } from "@/lib/ai/tools/propose-tools";
import type { ToolDefinition } from "@/lib/ai/tools/types";

export const TOOL_REGISTRY: ToolDefinition[] = [
  getOrders,
  getCustomers,
  getProducts,
  getAbandonedCheckouts,
  calculateCampaignCost,
  createCampaign,
  createPaymentOrder,
  getPaymentStatus,
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

export type { ToolDefinition, ToolEffect } from "@/lib/ai/tools/types";

import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  detectAbandonedCheckoutOpportunity,
  formatInr,
} from "@/lib/services/opportunity-engine";
import { defineTool } from "@/lib/ai/tools/types";

export const getOrders = defineTool({
  name: "get_orders",
  description:
    "List recent orders for this merchant, optionally filtered by status (CREATED, ATTEMPTED, PAID, EXPIRED).",
  effect: "read",
  inputSchema: z.object({
    status: z.enum(["CREATED", "ATTEMPTED", "PAID", "EXPIRED"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  handler: async (merchantId, input) => {
    const orders = await prisma.order.findMany({
      where: { merchantId, status: input.status },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return orders.map((o) => ({
      orderId: o.id,
      customerName: o.customer.name,
      status: o.status,
      amount: formatInr(o.amount),
      createdAt: o.createdAt.toISOString(),
    }));
  },
});

export const getCustomers = defineTool({
  name: "get_customers",
  description: "List customers for this merchant, optionally only those with more than one paid order.",
  effect: "read",
  inputSchema: z.object({
    repeatOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  handler: async (merchantId, input) => {
    const customers = await prisma.customer.findMany({
      where: { merchantId },
      include: { orders: { where: { status: "PAID" }, select: { amount: true } } },
      take: input.repeatOnly ? undefined : input.limit,
    });
    const withStats = customers
      .map((c) => ({
        customerId: c.id,
        name: c.name,
        paidOrderCount: c.orders.length,
        totalSpent: formatInr(c.orders.reduce((sum, o) => sum + o.amount, 0)),
      }))
      .filter((c) => (input.repeatOnly ? c.paidOrderCount > 1 : true))
      .slice(0, input.limit);
    return withStats;
  },
});

export const getProducts = defineTool({
  name: "get_products",
  description: "List this merchant's product catalog, optionally only in-stock items.",
  effect: "read",
  inputSchema: z.object({ availableOnly: z.boolean().default(false) }),
  handler: async (merchantId, input) => {
    const products = await prisma.product.findMany({
      where: { merchantId, available: input.availableOnly ? true : undefined },
    });
    return products.map((p) => ({
      productId: p.id,
      name: p.name,
      price: formatInr(p.price),
      available: p.available,
    }));
  },
});

export const getAbandonedCheckouts = defineTool({
  name: "get_abandoned_checkouts",
  description:
    "Run abandoned-checkout detection and return the current opportunity: total abandoned count/value, high-intent customer count, and evidence.",
  effect: "read",
  inputSchema: z.object({}),
  handler: async (merchantId) => {
    const result = await detectAbandonedCheckoutOpportunity(merchantId);
    if (!result.detected) return { detected: false };
    return {
      detected: true,
      opportunityId: result.opportunityId,
      totalAbandonedCount: result.totalAbandonedCount,
      totalAbandonedValue: formatInr(result.totalAbandonedValue),
      highIntentCount: result.highIntentCount,
      estimatedCost: formatInr(result.estimatedCost),
      expectedImpact: `${formatInr(result.impactMin)}-${formatInr(result.impactMax)}`,
      confidence: result.confidence,
      risk: result.risk,
      evidenceSample: result.evidence.slice(0, 5).map((e) => ({
        customerId: e.customerId,
        customerName: e.customerName,
        amount: formatInr(e.amount),
        hoursSinceAbandoned: e.hoursSinceAbandoned,
      })),
    };
  },
});

export const calculateCampaignCost = defineTool({
  name: "calculate_campaign_cost",
  description: "Calculate the total cost of a discount campaign given an audience size and per-customer discount in rupees.",
  effect: "read",
  inputSchema: z.object({
    audienceCount: z.number().int().min(1),
    discountPerCustomerRupees: z.number().min(1),
  }),
  handler: async (_merchantId, input) => {
    const totalCostPaise = Math.round(input.audienceCount * input.discountPerCustomerRupees * 100);
    return { totalCost: formatInr(totalCostPaise), totalCostPaise };
  },
});

export const getPaymentStatus = defineTool({
  name: "get_payment_status",
  description: "Look up the payment status for a given order.",
  effect: "read",
  inputSchema: z.object({ orderId: z.string() }),
  handler: async (merchantId, input) => {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId, merchantId },
      include: { payments: true },
    });
    if (!order) return { found: false };
    return {
      found: true,
      orderStatus: order.status,
      payments: order.payments.map((p) => ({
        status: p.status,
        amount: formatInr(p.amount),
        method: p.method,
      })),
    };
  },
});

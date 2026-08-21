import { prisma } from "@/backend/lib/db";

/** A merchant + owner user + a permissive default policy — the minimum
 * every test needs before it can exercise any service. */
export async function createMerchant(
  overrides: Partial<{
    maxCampaignBudget: number;
    maxDiscountPercent: number;
    maxTransactionValue: number;
  }> = {}
) {
  const merchant = await prisma.merchant.create({ data: { name: "Test Merchant" } });
  const user = await prisma.user.create({
    data: {
      merchantId: merchant.id,
      email: `owner-${merchant.id}@test.local`,
      passwordHash: "not-a-real-hash",
      role: "OWNER",
    },
  });
  const policy = await prisma.policy.create({
    data: {
      merchantId: merchant.id,
      maxCampaignBudget: overrides.maxCampaignBudget ?? 500_000,
      maxDiscountPercent: overrides.maxDiscountPercent ?? 20,
      maxTransactionValue: overrides.maxTransactionValue ?? 200_000,
      requireApprovalAlways: true,
      autoExecuteEnabled: false,
    },
  });
  return { merchant, user, policy };
}

export async function createCustomer(merchantId: string, overrides: Partial<{ name: string; email: string }> = {}) {
  return prisma.customer.create({
    data: {
      merchantId,
      name: overrides.name ?? "Test Customer",
      email: overrides.email,
    },
  });
}

export async function createProduct(
  merchantId: string,
  overrides: Partial<{ name: string; price: number; available: boolean }> = {}
) {
  return prisma.product.create({
    data: {
      merchantId,
      name: overrides.name ?? "Test Product",
      price: overrides.price ?? 100_00, // ₹100
      available: overrides.available ?? true,
    },
  });
}

/** An abandoned (CREATED, unpaid) order aged past the detection threshold. */
export async function createAbandonedOrder(
  merchantId: string,
  customerId: string,
  overrides: Partial<{ amount: number; ageMinutes: number }> = {}
) {
  const ageMinutes = overrides.ageMinutes ?? 60;
  return prisma.order.create({
    data: {
      merchantId,
      customerId,
      status: "CREATED",
      amount: overrides.amount ?? 3_000_00,
      createdAt: new Date(Date.now() - ageMinutes * 60_000),
    },
  });
}

export async function createPaidOrder(
  merchantId: string,
  customerId: string,
  items: Array<{ productId: string; unitPrice: number; quantity?: number }>
) {
  const amount = items.reduce((sum, i) => sum + i.unitPrice * (i.quantity ?? 1), 0);
  const order = await prisma.order.create({
    data: { merchantId, customerId, status: "PAID", amount },
  });
  await prisma.orderItem.createMany({
    data: items.map((i) => ({
      orderId: order.id,
      productId: i.productId,
      unitPrice: i.unitPrice,
      quantity: i.quantity ?? 1,
    })),
  });
  await prisma.payment.create({
    data: { orderId: order.id, status: "CAPTURED", amount, razorpayPaymentId: `pay_test_${order.id}` },
  });
  return order;
}

export async function createOpportunity(
  merchantId: string,
  overrides: Partial<{
    type: "ABANDONED_CHECKOUT" | "CROSS_SELL";
    status: "OPEN" | "DISMISSED" | "ACTIONED" | "EXPIRED";
    impactMin: number;
    impactMax: number;
    estimatedCost: number;
    evidence: unknown[];
    recommendedAction: Record<string, unknown>;
  }> = {}
) {
  return prisma.opportunity.create({
    data: {
      merchantId,
      type: overrides.type ?? "ABANDONED_CHECKOUT",
      status: overrides.status ?? "OPEN",
      title: "Test opportunity",
      explanation: "Test explanation",
      evidence: (overrides.evidence ?? []) as never,
      impactMin: overrides.impactMin ?? 10_000_00,
      impactMax: overrides.impactMax ?? 17_000_00,
      recommendedAction: (overrides.recommendedAction ?? { discountPerCustomer: 100_00, targetCustomerIds: [] }) as never,
      estimatedCost: overrides.estimatedCost ?? 2_000_00,
      confidence: 0.7,
      risk: "MEDIUM",
    },
  });
}

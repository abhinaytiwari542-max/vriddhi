import { prisma } from "@/lib/db";
import type { RiskLevel } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Abandoned-checkout opportunity detection — Phase 7.
//
// This is a deterministic, rule-based detector. It does NOT call an LLM.
// Every number here (evidence, cost, impact, confidence, risk) is derived
// directly from real order/customer rows and a small set of named
// assumptions declared below. Phase 8 adds an LLM layer that narrates this
// same data in natural language — it is not allowed to invent or override
// any of these numbers.
// ---------------------------------------------------------------------------

/** Orders newer than this are still "in progress" — not yet abandoned. */
const ABANDONMENT_THRESHOLD_MINUTES = 30;

/** A prior-purchaser who abandoned within this window is scored as high-intent. */
const HIGH_INTENT_RECENCY_HOURS = 48;

/**
 * Assumed fraction of high-intent customers who complete a discounted
 * recovery purchase if targeted. Based on typical cart-recovery campaign
 * benchmarks (15-25% link conversion) — stated explicitly so the estimated
 * impact is never presented as a bare, unexplained number.
 */
const ASSUMED_RECOVERY_RATE_LOW = 0.15;
const ASSUMED_RECOVERY_RATE_HIGH = 0.25;

/** Flat per-customer discount used for the recommended recovery action. */
const RECOVERY_DISCOUNT_PAISE = 10_000; // ₹100

export type AbandonedCheckoutEvidenceRow = {
  orderId: string;
  customerId: string;
  customerName: string;
  amount: number; // paise
  hoursSinceAbandoned: number;
  isRepeatCustomer: boolean;
  intentScore: number;
};

export type AbandonedCheckoutResult = {
  detected: false;
} | {
  detected: true;
  opportunityId: string;
  totalAbandonedCount: number;
  totalAbandonedValue: number; // paise
  highIntentCount: number;
  highIntentValue: number; // paise
  impactMin: number; // paise
  impactMax: number; // paise
  estimatedCost: number; // paise
  confidence: number;
  risk: RiskLevel;
  evidence: AbandonedCheckoutEvidenceRow[];
};

function scoreIntent({
  hasPriorPaidOrder,
  hoursSinceAbandoned,
  amount,
  medianAmount,
}: {
  hasPriorPaidOrder: boolean;
  hoursSinceAbandoned: number;
  amount: number;
  medianAmount: number;
}) {
  let score = 0;
  if (hasPriorPaidOrder) score += 1;
  if (hoursSinceAbandoned <= HIGH_INTENT_RECENCY_HOURS) score += 1;
  if (amount >= medianAmount) score += 1;
  return score;
}

function computeRisk(estimatedCostPaise: number): RiskLevel {
  if (estimatedCostPaise < 100_000) return "LOW"; // < ₹1,000
  if (estimatedCostPaise < 500_000) return "MEDIUM"; // < ₹5,000
  return "HIGH";
}

function computeConfidence(highIntentCount: number) {
  // More corroborating evidence rows -> more confidence, capped well short
  // of certainty since this is a heuristic, not a validated model.
  const scaled = 0.5 + Math.min(highIntentCount, 20) / 20 * 0.3;
  return Math.round(scaled * 100) / 100;
}

export async function detectAbandonedCheckoutOpportunity(
  merchantId: string
): Promise<AbandonedCheckoutResult> {
  const cutoff = new Date(Date.now() - ABANDONMENT_THRESHOLD_MINUTES * 60 * 1000);

  const abandonedOrders = await prisma.order.findMany({
    where: { merchantId, status: "CREATED", createdAt: { lte: cutoff } },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });

  if (abandonedOrders.length === 0) {
    return { detected: false };
  }

  const customerIds = [...new Set(abandonedOrders.map((o) => o.customerId))];
  const priorPaidOrders = await prisma.order.findMany({
    where: { merchantId, status: "PAID", customerId: { in: customerIds } },
    select: { customerId: true },
  });
  const paidCustomerIds = new Set(priorPaidOrders.map((o) => o.customerId));

  const amounts = abandonedOrders.map((o) => o.amount).sort((a, b) => a - b);
  const medianAmount = amounts[Math.floor(amounts.length / 2)];

  const now = Date.now();
  const scored = abandonedOrders.map((order) => {
    const hoursSinceAbandoned = (now - order.createdAt.getTime()) / (1000 * 60 * 60);
    const hasPriorPaidOrder = paidCustomerIds.has(order.customerId);
    const intentScore = scoreIntent({
      hasPriorPaidOrder,
      hoursSinceAbandoned,
      amount: order.amount,
      medianAmount,
    });
    return {
      orderId: order.id,
      customerId: order.customerId,
      customerName: order.customer.name,
      amount: order.amount,
      hoursSinceAbandoned: Math.round(hoursSinceAbandoned),
      isRepeatCustomer: hasPriorPaidOrder,
      intentScore,
    };
  });

  const HIGH_INTENT_THRESHOLD = 2;
  const highIntent = scored.filter((s) => s.intentScore >= HIGH_INTENT_THRESHOLD);

  const totalAbandonedValue = scored.reduce((sum, s) => sum + s.amount, 0);
  const highIntentValue = highIntent.reduce((sum, s) => sum + s.amount, 0);

  const impactMin = Math.round(highIntentValue * ASSUMED_RECOVERY_RATE_LOW);
  const impactMax = Math.round(highIntentValue * ASSUMED_RECOVERY_RATE_HIGH);
  const estimatedCost = highIntent.length * RECOVERY_DISCOUNT_PAISE;
  const risk = computeRisk(estimatedCost);
  const confidence = computeConfidence(highIntent.length);

  const title = `${scored.length} abandoned checkouts · ${formatInr(totalAbandonedValue)} stalled`;

  const explanation =
    `${scored.length} customers started checkout in the last 90 days but never completed payment, ` +
    `worth ${formatInr(totalAbandonedValue)} in stalled revenue. ${highIntent.length} of them scored ` +
    `high-intent — they have a prior completed purchase, abandoned within the last ${HIGH_INTENT_RECENCY_HOURS} hours, ` +
    `or abandoned an above-typical cart value. Assuming a ${Math.round(ASSUMED_RECOVERY_RATE_LOW * 100)}–` +
    `${Math.round(ASSUMED_RECOVERY_RATE_HIGH * 100)}% recovery rate on a targeted discount (typical for this kind ` +
    `of campaign), recovering this segment is worth an estimated ${formatInr(impactMin)}–${formatInr(impactMax)}.`;

  const recommendedAction = {
    type: "recovery_discount_campaign",
    audienceCount: highIntent.length,
    discountPerCustomer: RECOVERY_DISCOUNT_PAISE,
    targetCustomerIds: highIntent.map((s) => s.customerId),
  };

  const evidence = highIntent.map((s) => ({
    orderId: s.orderId,
    customerId: s.customerId,
    customerName: s.customerName,
    amount: s.amount,
    hoursSinceAbandoned: s.hoursSinceAbandoned,
    isRepeatCustomer: s.isRepeatCustomer,
    intentScore: s.intentScore,
  }));

  const existing = await prisma.opportunity.findFirst({
    where: { merchantId, type: "ABANDONED_CHECKOUT", status: "OPEN" },
  });

  const data = {
    merchantId,
    type: "ABANDONED_CHECKOUT" as const,
    status: "OPEN" as const,
    title,
    explanation,
    evidence,
    impactMin,
    impactMax,
    recommendedAction,
    estimatedCost,
    confidence,
    risk,
  };

  const opportunity = existing
    ? await prisma.opportunity.update({ where: { id: existing.id }, data })
    : await prisma.opportunity.create({ data });

  return {
    detected: true,
    opportunityId: opportunity.id,
    totalAbandonedCount: scored.length,
    totalAbandonedValue,
    highIntentCount: highIntent.length,
    highIntentValue,
    impactMin,
    impactMax,
    estimatedCost,
    confidence,
    risk,
    evidence,
  };
}

export function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

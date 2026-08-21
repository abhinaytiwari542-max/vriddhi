import { prisma } from "@/backend/lib/db";
import { formatInr } from "@/frontend/lib/format";

// ---------------------------------------------------------------------------
// Cross-sell opportunity detection — Phase 16.
//
// Second revenue use case, reusing the same discipline as Phase 7: a
// deterministic, rule-based detector (no LLM), every number traceable to
// real OrderItem rows, no cost/impact claimed without a named assumption.
// Basket analysis over real paid-order line items — computed from the
// deliberate purchase-affinity signal built into the Phase 6 seed data,
// not asserted.
// ---------------------------------------------------------------------------

const MIN_CO_OCCURRENCE = 4; // pair must appear together in at least this many orders
const MIN_LIFT = 1.3; // must be meaningfully more likely than chance
const MIN_CONFIDENCE = 0.15; // at least this fraction of A's buyers also buy B

/** Assumed extra attach-rate a featured cross-sell adds on top of the
 * existing organic co-purchase rate — a named merchandising assumption,
 * not a measured fact, exactly like Phase 7's recovery-rate assumption. */
const ASSUMED_UPLIFT_LOW = 0.05;
const ASSUMED_UPLIFT_HIGH = 0.12;

export type CrossSellResult =
  | { detected: false }
  | {
      detected: true;
      opportunityId: string;
      productId: string;
      productName: string;
      recommendedProductId: string;
      recommendedProductName: string;
      recommendedProductPrice: number; // paise
      coOccurrenceCount: number;
      supportA: number;
      support: number; // fraction of all orders containing both
      confidence: number; // P(B|A)
      lift: number;
      impactMin: number; // paise
      impactMax: number; // paise
      confidenceScore: number; // 0-1, how much evidence backs this
    };

function computeConfidenceScore(coOccurrence: number) {
  const scaled = 0.5 + (Math.min(coOccurrence, 20) / 20) * 0.3;
  return Math.round(scaled * 100) / 100;
}

export async function detectCrossSellOpportunity(merchantId: string): Promise<CrossSellResult> {
  const items = await prisma.orderItem.findMany({
    where: { order: { merchantId, status: "PAID" } },
    select: { orderId: true, productId: true, product: { select: { name: true, price: true } } },
  });

  if (items.length === 0) return { detected: false };

  const ordersByProduct = new Map<string, Set<string>>();
  const productNames = new Map<string, string>();
  const productPrices = new Map<string, number>();
  const orderProductSets = new Map<string, Set<string>>();

  for (const item of items) {
    productNames.set(item.productId, item.product.name);
    productPrices.set(item.productId, item.product.price);

    if (!ordersByProduct.has(item.productId)) ordersByProduct.set(item.productId, new Set());
    ordersByProduct.get(item.productId)!.add(item.orderId);

    if (!orderProductSets.has(item.orderId)) orderProductSets.set(item.orderId, new Set());
    orderProductSets.get(item.orderId)!.add(item.productId);
  }

  const totalOrders = orderProductSets.size;
  const pairCoOccurrence = new Map<string, number>();

  for (const productSet of orderProductSets.values()) {
    const productIds = [...productSet];
    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const key = `${productIds[i]}|${productIds[j]}`;
        pairCoOccurrence.set(key, (pairCoOccurrence.get(key) ?? 0) + 1);
      }
    }
  }

  // Pairs already approved and applied shouldn't be re-surfaced as a fresh
  // "opportunity" needing another decision — they'd otherwise dominate the
  // top-lift slot forever and starve out the next-best candidate.
  // Same for pairs the merchant already explicitly rejected — don't nag
  // them with the identical suggestion on every future detection run.
  const [applied, dismissed] = await Promise.all([
    prisma.productCrossSell.findMany({
      where: { merchantId },
      select: { productId: true, recommendedProductId: true },
    }),
    prisma.opportunity.findMany({
      where: { merchantId, type: "CROSS_SELL", status: "DISMISSED" },
      select: { recommendedAction: true },
    }),
  ]);
  const alreadyApplied = new Set(
    applied.map((r) => `${r.productId}|${r.recommendedProductId}`)
  );
  for (const d of dismissed) {
    const action = d.recommendedAction as { productId?: string; recommendedProductId?: string };
    if (action.productId && action.recommendedProductId) {
      alreadyApplied.add(`${action.productId}|${action.recommendedProductId}`);
    }
  }

  type Candidate = {
    a: string;
    b: string;
    coOccurrence: number;
    lift: number;
    confidenceAtoB: number;
  };

  const candidates: Candidate[] = [];

  for (const [key, coOccurrence] of pairCoOccurrence) {
    if (coOccurrence < MIN_CO_OCCURRENCE) continue;
    const [x, y] = key.split("|");
    const supportX = ordersByProduct.get(x)!.size;
    const supportY = ordersByProduct.get(y)!.size;

    // Base = the more commonly purchased of the pair (the "anchor" product
    // a merchant would feature the recommendation on); recommended = the
    // other. Lift is symmetric either way; direction is a merchandising
    // choice, not a statistical one.
    const [a, b, supportA, supportB] = supportX >= supportY ? [x, y, supportX, supportY] : [y, x, supportY, supportX];

    if (alreadyApplied.has(`${a}|${b}`)) continue;

    const confidenceAtoB = coOccurrence / supportA;
    const lift = confidenceAtoB / (supportB / totalOrders);

    if (lift < MIN_LIFT || confidenceAtoB < MIN_CONFIDENCE) continue;

    candidates.push({ a, b, coOccurrence, lift, confidenceAtoB });
  }

  if (candidates.length === 0) return { detected: false };

  candidates.sort((x, y) => y.lift - x.lift);
  const best = candidates[0];

  const supportA = ordersByProduct.get(best.a)!.size;
  const priceB = productPrices.get(best.b)!;
  const impactMin = Math.round(supportA * ASSUMED_UPLIFT_LOW) * priceB;
  const impactMax = Math.round(supportA * ASSUMED_UPLIFT_HIGH) * priceB;
  const confidenceScore = computeConfidenceScore(best.coOccurrence);

  const title = `${productNames.get(best.a)} customers frequently buy ${productNames.get(best.b)}`;
  const explanation =
    `${best.coOccurrence} of ${supportA} customers who bought "${productNames.get(best.a)}" also bought ` +
    `"${productNames.get(best.b)}" in the same order — a ${Math.round(best.confidenceAtoB * 100)}% attach rate, ` +
    `${best.lift.toFixed(1)}x more likely than chance. Featuring "${productNames.get(best.b)}" as a cross-sell on ` +
    `"${productNames.get(best.a)}"'s page could plausibly add ${Math.round(ASSUMED_UPLIFT_LOW * 100)}-` +
    `${Math.round(ASSUMED_UPLIFT_HIGH * 100)} percentage points of attach rate (a stated assumption, not a measured ` +
    `fact) — worth an estimated ${formatInr(impactMin)}-${formatInr(impactMax)} in incremental revenue.`;

  const recommendedAction = {
    type: "cross_sell_recommendation",
    productId: best.a,
    recommendedProductId: best.b,
  };

  const evidence = [
    {
      productId: best.a,
      productName: productNames.get(best.a),
      recommendedProductId: best.b,
      recommendedProductName: productNames.get(best.b),
      coOccurrenceCount: best.coOccurrence,
      supportA,
      confidence: best.confidenceAtoB,
      lift: best.lift,
    },
  ];

  const existing = await prisma.opportunity.findFirst({
    where: { merchantId, type: "CROSS_SELL", status: "OPEN" },
  });

  const data = {
    merchantId,
    type: "CROSS_SELL" as const,
    status: "OPEN" as const,
    title,
    explanation,
    evidence,
    impactMin,
    impactMax,
    recommendedAction,
    estimatedCost: 0,
    confidence: confidenceScore,
    risk: "LOW" as const,
  };

  const numbersChanged =
    existing &&
    ((existing.recommendedAction as { recommendedProductId?: string })?.recommendedProductId !== best.b ||
      existing.impactMin !== impactMin ||
      existing.impactMax !== impactMax);

  const opportunity = existing
    ? await prisma.opportunity.update({ where: { id: existing.id }, data })
    : await prisma.opportunity.create({ data });

  if (!existing || numbersChanged) {
    await prisma.auditLog.create({
      data: {
        merchantId,
        actor: "SYSTEM",
        action: existing ? "cross_sell.updated" : "cross_sell.detected",
        input: { type: "CROSS_SELL" },
        output: { productA: best.a, productB: best.b, lift: best.lift, coOccurrence: best.coOccurrence },
        status: "SUCCESS",
        relatedEntityType: "Opportunity",
        relatedEntityId: opportunity.id,
      },
    });
  }

  return {
    detected: true,
    opportunityId: opportunity.id,
    productId: best.a,
    productName: productNames.get(best.a)!,
    recommendedProductId: best.b,
    recommendedProductName: productNames.get(best.b)!,
    recommendedProductPrice: priceB,
    coOccurrenceCount: best.coOccurrence,
    supportA,
    support: best.coOccurrence / totalOrders,
    confidence: best.confidenceAtoB,
    lift: best.lift,
    impactMin,
    impactMax,
    confidenceScore,
  };
}

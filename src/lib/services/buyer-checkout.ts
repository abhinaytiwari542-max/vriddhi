import { prisma } from "@/lib/db";
import { getDemoMerchant } from "@/lib/demo-merchant";
import { getRazorpayGateway } from "@/lib/razorpay/gateway";
import { formatInr } from "@/lib/format";

// ---------------------------------------------------------------------------
// AI buyer checkout — Phase 18.
//
// The reverse direction of agentic commerce: instead of our merchant's
// agent proposing actions to the merchant, this is a shopper's agent
// proposing a purchase to the shopper. Same discipline, mirrored: the LLM
// (buyer-agent.ts) can only ever call proposePurchase(), which creates an
// unpaid, pending order — it has no tool that can pay. Only
// completeBuyerPurchase(), called exclusively from a human button click
// (never from the agent loop), can move to payment, and it re-checks
// everything again before doing so.
// ---------------------------------------------------------------------------

export type ProposalVerdict =
  | { ok: true; orderId: string; productName: string; priceRupees: number; deliveryEstimate: string | null }
  | { ok: false; reason: "not_found" | "unavailable" | "over_budget"; detail: string };

export async function proposePurchase(input: {
  productId: string;
  budgetRupees: number;
  buyerName: string;
  buyerEmail?: string;
}): Promise<ProposalVerdict> {
  const merchant = await getDemoMerchant();
  if (!merchant) return { ok: false, reason: "not_found", detail: "No merchant found." };

  const product = await prisma.product.findFirst({
    where: { id: input.productId, merchantId: merchant.id },
  });
  if (!product) {
    return { ok: false, reason: "not_found", detail: "No such product in the catalog." };
  }

  // Guardrail 1: availability. Never propose something out of stock.
  if (!product.available) {
    return {
      ok: false,
      reason: "unavailable",
      detail: `${product.name} is currently unavailable.`,
    };
  }

  // Guardrail 2: price limit. The buyer's stated budget is a hard ceiling,
  // not a preference the agent can talk itself past.
  const priceRupees = product.price / 100;
  if (priceRupees > input.budgetRupees) {
    return {
      ok: false,
      reason: "over_budget",
      detail: `${product.name} costs ${formatInr(product.price)}, which exceeds the ${formatInr(
        Math.round(input.budgetRupees * 100)
      )} budget.`,
    };
  }

  let customer = input.buyerEmail
    ? await prisma.customer.findFirst({ where: { merchantId: merchant.id, email: input.buyerEmail } })
    : null;
  if (!customer) {
    customer = await prisma.customer.create({
      data: { merchantId: merchant.id, name: input.buyerName, email: input.buyerEmail },
    });
  }

  const order = await prisma.order.create({
    data: {
      merchantId: merchant.id,
      customerId: customer.id,
      status: "CREATED",
      amount: product.price,
      currency: product.currency,
    },
  });
  await prisma.orderItem.create({
    data: { orderId: order.id, productId: product.id, quantity: 1, unitPrice: product.price },
  });

  await prisma.auditLog.create({
    data: {
      merchantId: merchant.id,
      actor: "AI",
      action: "buyer.purchase_proposed",
      input: { productId: product.id, budgetRupees: input.budgetRupees },
      output: { orderId: order.id, priceRupees },
      status: "SUCCESS",
      relatedEntityType: "Order",
      relatedEntityId: order.id,
    },
  });

  return {
    ok: true,
    orderId: order.id,
    productName: product.name,
    priceRupees,
    deliveryEstimate: product.deliveryEstimate,
  };
}

export type PurchaseCompletionResult =
  | { ok: true; paymentLinkId: string; mode: "real" | "simulated" }
  | { ok: false; error: string; retryable: boolean };

/**
 * The only path from a proposed order to an actual charge. Called
 * exclusively by a human clicking "Authorize & pay" — never by the agent
 * loop. Re-validates availability and budget one more time (limits or
 * stock could have changed between proposal and this click) before doing
 * anything. The authorization itself is logged (actor CUSTOMER) separately
 * from whether the payment then succeeds, so "the customer said yes" and
 * "the payment worked" are two distinct, independently auditable facts —
 * exactly like the merchant side keeps "approved" separate from "executed."
 */
export async function completeBuyerPurchase(
  orderId: string,
  budgetRupees: number,
  options: { simulateFailure?: boolean } = {}
): Promise<PurchaseCompletionResult> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } }, customer: true },
  });

  if (order.status !== "CREATED") {
    await prisma.auditLog.create({
      data: {
        merchantId: order.merchantId,
        actor: "SYSTEM",
        action: "duplicate_prevention.buyer_reauthorization_blocked",
        input: { orderId: order.id },
        output: { orderStatus: order.status },
        status: "SUCCESS",
        relatedEntityType: "Order",
        relatedEntityId: order.id,
      },
    });
    return { ok: false, error: "This order is no longer awaiting authorization.", retryable: false };
  }

  const item = order.items[0];
  if (!item.product.available) {
    return { ok: false, error: `${item.product.name} is no longer available.`, retryable: false };
  }
  const priceRupees = item.product.price / 100;
  if (priceRupees > budgetRupees) {
    return {
      ok: false,
      error: "This order now exceeds the authorized budget — re-check and try again.",
      retryable: false,
    };
  }

  await prisma.auditLog.create({
    data: {
      merchantId: order.merchantId,
      actor: "CUSTOMER",
      action: "buyer.purchase_authorized",
      input: { orderId: order.id },
      output: { priceRupees },
      status: "SUCCESS",
      relatedEntityType: "Order",
      relatedEntityId: order.id,
    },
  });

  const gateway = getRazorpayGateway();

  try {
    if (options.simulateFailure) {
      throw new Error("Payment declined (simulated for demo).");
    }

    const link = await gateway.createPaymentLink({
      amountPaise: order.amount,
      currency: "INR",
      customerName: order.customer.name,
      customerEmail: order.customer.email,
      customerContact: order.customer.phone,
      description: `AI buyer purchase — ${item.product.name}${gateway.mode === "simulated" ? " (SIMULATED)" : ""}`,
      referenceId: order.id,
    });

    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayPaymentId: link.id,
        status: "CAPTURED",
        amount: order.amount,
        method: "upi",
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });

    await prisma.auditLog.create({
      data: {
        merchantId: order.merchantId,
        actor: "RAZORPAY",
        action: "buyer.purchase_completed",
        input: { orderId: order.id },
        output: { paymentLinkId: link.id, mode: gateway.mode },
        status: "SUCCESS",
        relatedEntityType: "Order",
        relatedEntityId: order.id,
      },
    });

    return { ok: true, paymentLinkId: link.id, mode: gateway.mode };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Order stays CREATED — not PAID, not CANCELLED. No Payment row is
    // written as CAPTURED. The customer can retry the exact same order;
    // nothing here can be double-charged since no charge happened.
    await prisma.auditLog.create({
      data: {
        merchantId: order.merchantId,
        actor: "RAZORPAY",
        action: "buyer.payment_failed",
        input: { orderId: order.id },
        status: "FAILURE",
        relatedEntityType: "Order",
        relatedEntityId: order.id,
        error: message,
      },
    });

    return { ok: false, error: message, retryable: true };
  }
}

export type CancelResult = { ok: true } | { ok: false; error: string };

/** The customer declining a proposed purchase — distinct from a failed
 * payment. Only valid while the order is still CREATED (unpaid, pending). */
export async function cancelBuyerOrder(orderId: string): Promise<CancelResult> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  if (order.status !== "CREATED") {
    return { ok: false, error: "This order can no longer be cancelled." };
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
  await prisma.auditLog.create({
    data: {
      merchantId: order.merchantId,
      actor: "CUSTOMER",
      action: "buyer.purchase_cancelled",
      input: { orderId },
      status: "SUCCESS",
      relatedEntityType: "Order",
      relatedEntityId: orderId,
    },
  });

  return { ok: true };
}

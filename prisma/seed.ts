import "dotenv/config";
import { fakerEN_IN as faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

// ---------------------------------------------------------------------------
// Vriddhi demo seed data — Phase 6.
//
// Builds one internally-consistent merchant history: a footwear/apparel D2C
// store ("Stride Collective") with products, customers, and three distinct
// order outcomes (paid, failed-payment, abandoned-checkout), plus repeat
// buyers. This is what the Overview dashboard and the Phase 7 opportunity
// engine run against before any real Razorpay integration exists.
//
// Razorpay order/payment IDs below are synthetically shaped (order_/pay_
// prefixes) for UI realism only — they are NOT real Razorpay objects. Real
// integration starts at Phase 12.
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MERCHANT_NAME = "Stride Collective";
const OWNER_EMAIL = "owner@stridecollective.test";

const TOTAL_CUSTOMERS = 190;
const TARGET_PAID_ORDERS = 150;
const REPEAT_BUYER_COUNT = 35;
const SINGLE_PURCHASE_COUNT = 55;
const FAILED_PAYMENT_ORDERS = 10;
const ABANDONED_HIGH_INTENT = 18; // existing customers, abandoned within 48h
const ABANDONED_LOW_INTENT = 25; // new customers or older abandonments

type SeedProduct = { name: string; price: number; variants: string[]; available?: boolean };

const PRODUCTS: SeedProduct[] = [
  { name: "Trailblazer Running Shoes", price: 299900, variants: ["7", "8", "9", "10", "11"] },
  { name: "Urban Sprint Sneakers", price: 349900, variants: ["7", "8", "9", "10"] },
  { name: "CloudStep Walking Shoes", price: 219900, variants: ["6", "7", "8", "9", "10"] },
  { name: "Marathon Pro Racers", price: 449900, variants: ["8", "9", "10", "11"] },
  { name: "Everyday Canvas Sneakers", price: 179900, variants: ["6", "7", "8", "9"] },
  { name: "TrailGrip Hiking Boots", price: 419900, variants: ["8", "9", "10", "11", "12"] },
  { name: "FlexFit Training Shoes", price: 259900, variants: ["7", "8", "9", "10"] },
  { name: "Classic Court Sneakers", price: 199900, variants: ["6", "7", "8", "9", "10"] },
  { name: "Performance Ankle Socks (3-pack)", price: 49900, variants: ["Free size"] },
  { name: "Moisture-Wick Sports Tee", price: 89900, variants: ["S", "M", "L", "XL"] },
  { name: "Lightweight Running Cap", price: 59900, variants: ["Free size"] },
  { name: "Compression Calf Sleeves", price: 69900, variants: ["S/M", "L/XL"] },
  { name: "All-Terrain Sandals", price: 149900, variants: ["7", "8", "9", "10"], available: false },
  { name: "Limited Edition Racing Flats", price: 549900, variants: ["9", "10"], available: false },
];

// Phase 16 — deliberate purchase affinity so the cross-sell engine (basket
// analysis over real OrderItem rows) has a genuine, non-random signal to
// find, the same way Phase 6's abandoned-checkout data was built with a
// real high-intent signal baked in rather than pure noise.
const AFFINITY_PARTNER: Record<string, string> = {
  "Trailblazer Running Shoes": "Performance Ankle Socks (3-pack)",
  "CloudStep Walking Shoes": "Performance Ankle Socks (3-pack)",
  "Urban Sprint Sneakers": "Moisture-Wick Sports Tee",
  "FlexFit Training Shoes": "Moisture-Wick Sports Tee",
  "Marathon Pro Racers": "Compression Calf Sleeves",
  "TrailGrip Hiking Boots": "Lightweight Running Cap",
};
const AFFINITY_BIAS = 0.65; // chance the 2nd item is the defined partner, not a random product

function paise(rupees: number) {
  return Math.round(rupees * 100);
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function synthRazorpayId(prefix: string, n: number) {
  return `${prefix}_DemoSeed${String(n).padStart(6, "0")}`;
}

async function main() {
  console.log(`Seeding "${MERCHANT_NAME}"...`);

  // Clear in FK-safe order so this script is safely re-runnable.
  await prisma.auditLog.deleteMany();
  await prisma.failure.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.campaignTarget.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.agentAction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.user.deleteMany();
  await prisma.merchant.deleteMany();

  const merchant = await prisma.merchant.create({
    data: { name: MERCHANT_NAME },
  });

  await prisma.user.create({
    data: {
      merchantId: merchant.id,
      email: OWNER_EMAIL,
      // Placeholder only — Auth.js wiring (later phase) replaces this with a
      // real bcrypt/argon2 hash. Login is not functional yet.
      passwordHash: "placeholder-not-a-real-hash",
      role: "OWNER",
    },
  });

  await prisma.policy.create({
    data: {
      merchantId: merchant.id,
      maxCampaignBudget: paise(5000),
      maxDiscountPercent: 20,
      maxTransactionValue: paise(2000),
      requireApprovalAlways: true,
      autoExecuteEnabled: false,
    },
  });

  const products = await Promise.all(
    PRODUCTS.map((p) =>
      prisma.product.create({
        data: {
          merchantId: merchant.id,
          name: p.name,
          price: p.price,
          currency: "INR",
          available: p.available ?? true,
          variants: p.variants,
          deliveryEstimate: pick(["2-4 days", "3-5 days", "4-6 days"]),
        },
      })
    )
  );

  // --- Customers -----------------------------------------------------------
  // firstSeenAt spread across the last 90 days so recency-based scoring
  // (Phase 7) has real variation to work with.
  const customers = await Promise.all(
    Array.from({ length: TOTAL_CUSTOMERS }).map(() =>
      prisma.customer.create({
        data: {
          merchantId: merchant.id,
          name: faker.person.fullName(),
          email: faker.internet.email().toLowerCase(),
          phone: faker.phone.number(),
          firstSeenAt: hoursAgo(randomInt(1, 90 * 24)),
        },
      })
    )
  );

  // Reserve distinct customer pools so no one accidentally plays two roles
  // in a way that would misrepresent the story (e.g. a "new customer"
  // abandoned-cart example should never already have a paid order).
  const shuffled = [...customers].sort(() => Math.random() - 0.5);
  let cursor = 0;
  const take = (n: number) => shuffled.slice((cursor += n) - n, cursor);

  const repeatBuyers = take(REPEAT_BUYER_COUNT); // will receive 2-3 paid orders each
  const singlePurchaseBuyers = take(SINGLE_PURCHASE_COUNT); // exactly 1 paid order
  const highIntentAbandoners = take(ABANDONED_HIGH_INTENT); // paid before, then abandoned recently
  const lowIntentAbandoners = take(ABANDONED_LOW_INTENT); // brand-new, never purchased
  const failedPaymentCustomers = take(FAILED_PAYMENT_ORDERS); // attempted, card/payment failed
  // ~47 remaining customers stay order-less — first-touch/browse-only records.

  const purchasableProducts = products.filter((p) => p.available);

  function buildBasket() {
    const primary = pick(purchasableProducts);
    const basket = [primary];

    const itemCount = randomInt(1, 100) <= 60 ? 1 : randomInt(1, 100) <= 75 ? 2 : 3;
    // (60% chance 1 item, ~30% 2 items, ~10% 3 items — see the two nested
    // ternary thresholds above.)

    for (let i = 1; i < itemCount; i++) {
      const partnerName = AFFINITY_PARTNER[basket[basket.length - 1].name];
      const partner = partnerName
        ? purchasableProducts.find((p) => p.name === partnerName)
        : undefined;
      const useAffinityPartner = partner && Math.random() < AFFINITY_BIAS && !basket.includes(partner);

      const next = useAffinityPartner
        ? partner
        : pick(purchasableProducts.filter((p) => !basket.includes(p)));
      basket.push(next);
    }
    return basket;
  }

  let orderSeq = 0;
  let paymentSeq = 0;
  let paidOrderCount = 0;

  async function createPaidOrder(customerId: string, daysAgo: number) {
    const basket = buildBasket();
    const amount = basket.reduce((sum, p) => sum + p.price, 0);
    orderSeq += 1;
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId,
        razorpayOrderId: synthRazorpayId("order", orderSeq),
        status: "PAID",
        amount,
        currency: "INR",
        createdAt: hoursAgo(daysAgo * 24 + randomInt(0, 23)),
      },
    });
    await prisma.orderItem.createMany({
      data: basket.map((p) => ({
        orderId: order.id,
        productId: p.id,
        quantity: 1,
        unitPrice: p.price,
      })),
    });
    paymentSeq += 1;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayPaymentId: synthRazorpayId("pay", paymentSeq),
        status: "CAPTURED",
        amount,
        method: pick(["card", "upi", "netbanking", "wallet"]),
        createdAt: order.createdAt,
      },
    });
    paidOrderCount += 1;
  }

  async function createFailedOrder(customerId: string) {
    const amount = paise(randomInt(1200, 5500));
    orderSeq += 1;
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId,
        razorpayOrderId: synthRazorpayId("order", orderSeq),
        status: "ATTEMPTED",
        amount,
        currency: "INR",
        createdAt: hoursAgo(randomInt(1, 14 * 24)),
      },
    });
    paymentSeq += 1;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayPaymentId: synthRazorpayId("pay", paymentSeq),
        status: "FAILED",
        amount,
        method: pick(["card", "upi", "netbanking"]),
        createdAt: order.createdAt,
      },
    });
  }

  async function createAbandonedOrder(customerId: string, ageHours: number, amount: number) {
    orderSeq += 1;
    // No razorpayOrderId, no Payment row: checkout was started locally but
    // never reached Razorpay — the actual "abandoned" signal Phase 7 detects.
    await prisma.order.create({
      data: {
        merchantId: merchant.id,
        customerId,
        status: "CREATED",
        amount,
        currency: "INR",
        createdAt: hoursAgo(ageHours),
      },
    });
    return amount;
  }

  // Repeat buyers: 2-3 paid orders each, spread over the last ~75 days.
  for (const c of repeatBuyers) {
    const orderCount = randomInt(2, 3);
    for (let i = 0; i < orderCount; i++) {
      await createPaidOrder(c.id, randomInt(1, 75));
    }
  }

  // Single-purchase buyers.
  for (const c of singlePurchaseBuyers) {
    await createPaidOrder(c.id, randomInt(1, 75));
  }

  // Top up to the paid-order target (repeat-buyer counts are randomized).
  while (paidOrderCount < TARGET_PAID_ORDERS) {
    await createPaidOrder(pick(repeatBuyers).id, randomInt(1, 75));
  }

  // Failed payments: attempted, card/UPI declined, never retried.
  for (const c of failedPaymentCustomers.slice(0, FAILED_PAYMENT_ORDERS)) {
    await createFailedOrder(c.id);
  }

  // High-intent abandoned checkouts: customers who already bought before,
  // then abandoned a fresh cart within the last 48 hours.
  let abandonedTotal = 0;
  for (const c of highIntentAbandoners.slice(0, ABANDONED_HIGH_INTENT)) {
    await createPaidOrder(c.id, randomInt(20, 74)); // establishes purchase history
    const amount = paise(randomInt(1800, 3900));
    abandonedTotal += await createAbandonedOrder(c.id, randomInt(2, 47), amount);
  }

  // Low-intent abandoned checkouts: brand-new customers, wider recency spread.
  for (const c of lowIntentAbandoners.slice(0, ABANDONED_LOW_INTENT)) {
    const amount = paise(randomInt(700, 4500));
    abandonedTotal += await createAbandonedOrder(c.id, randomInt(1, 96), amount);
  }

  // --- Report ----------------------------------------------------------------
  const [customerCount, orderCount, paidCount, abandonedCount, failedCount] =
    await Promise.all([
      prisma.customer.count(),
      prisma.order.count(),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.count({ where: { status: "CREATED" } }),
      prisma.order.count({ where: { status: "ATTEMPTED" } }),
    ]);

  const gmv = await prisma.order.aggregate({
    where: { status: "PAID" },
    _sum: { amount: true },
  });

  const totalGmv = gmv._sum.amount ?? 0;
  const aov = paidCount > 0 ? totalGmv / paidCount : 0;
  const conversion = orderCount > 0 ? (paidCount / orderCount) * 100 : 0;

  console.log("\nSeed complete.\n");
  console.log(`Products:            ${products.length}`);
  console.log(`Customers:           ${customerCount}`);
  console.log(`Orders (total):      ${orderCount}`);
  console.log(`  Paid:              ${paidCount}`);
  console.log(`  Abandoned:         ${abandonedCount} (~${ABANDONED_HIGH_INTENT} high-intent, ~${ABANDONED_LOW_INTENT} low-intent)`);
  console.log(`  Failed payment:    ${failedCount}`);
  console.log(`GMV (captured):      ₹${(totalGmv / 100).toLocaleString("en-IN")}`);
  console.log(`AOV:                 ₹${(aov / 100).toFixed(0)}`);
  console.log(`Conversion:          ${conversion.toFixed(1)}%`);
  console.log(`Abandoned cart value: ₹${(abandonedTotal / 100).toLocaleString("en-IN")}`);

  const itemCount = await prisma.orderItem.count();
  console.log(`Order line items:    ${itemCount}`);
  console.log(`(basket sizes vary 1-3 items, with deliberate product affinity — see AFFINITY_PARTNER)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

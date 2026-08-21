import { prisma } from "@/lib/db";
import { getDemoMerchant } from "@/lib/demo-merchant";

// ---------------------------------------------------------------------------
// AI-readable catalog — Phase 17.
//
// This is a deliberately public contract, independent of our internal
// Prisma schema: snake_case keys, and price in whole/decimal INR rupees —
// NOT paise, even though Product.price is stored in paise internally
// (matching Razorpay's convention). An external AI buyer should never need
// to know our storage unit; the documented contract is rupees, matching
// the example in docs/PHASE-17-CATALOG-API.md.
// ---------------------------------------------------------------------------

export type CatalogProduct = {
  product_id: string;
  name: string;
  price: number; // INR rupees, e.g. 2999 or 2999.5 — never paise
  currency: string;
  available: boolean;
  variants: string[];
  delivery_estimate: string | null;
};

export type CatalogFilters = {
  q?: string;
  available?: boolean;
  maxPriceRupees?: number;
  minPriceRupees?: number;
  limit?: number;
  offset?: number;
};

function serializeProduct(p: {
  id: string;
  name: string;
  price: number;
  currency: string;
  available: boolean;
  variants: unknown;
  deliveryEstimate: string | null;
}): CatalogProduct {
  return {
    product_id: p.id,
    name: p.name,
    price: p.price / 100,
    currency: p.currency,
    available: p.available,
    variants: Array.isArray(p.variants) ? (p.variants as string[]) : [],
    delivery_estimate: p.deliveryEstimate,
  };
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export async function listCatalogProducts(filters: CatalogFilters = {}) {
  const merchant = await getDemoMerchant();
  if (!merchant) return { products: [] as CatalogProduct[], total: 0 };

  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = filters.offset ?? 0;

  const where = {
    merchantId: merchant.id,
    ...(filters.available !== undefined ? { available: filters.available } : {}),
    ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" as const } } : {}),
    ...(filters.maxPriceRupees !== undefined || filters.minPriceRupees !== undefined
      ? {
          price: {
            ...(filters.maxPriceRupees !== undefined ? { lte: Math.round(filters.maxPriceRupees * 100) } : {}),
            ...(filters.minPriceRupees !== undefined ? { gte: Math.round(filters.minPriceRupees * 100) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { name: "asc" }, take: limit, skip: offset }),
    prisma.product.count({ where }),
  ]);

  return { products: rows.map(serializeProduct), total };
}

export async function getCatalogProduct(productId: string): Promise<CatalogProduct | null> {
  const merchant = await getDemoMerchant();
  if (!merchant) return null;

  const product = await prisma.product.findFirst({
    where: { id: productId, merchantId: merchant.id },
  });
  return product ? serializeProduct(product) : null;
}

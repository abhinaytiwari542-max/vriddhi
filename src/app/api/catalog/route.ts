import { NextRequest, NextResponse } from "next/server";

import { listCatalogProducts } from "@/lib/services/catalog";

// Deliberately public, unlike every other route in this app — this is the
// one API meant to be called by an external AI buyer (Phase 18), not by
// our own authenticated merchant UI. See docs/PHASE-17-CATALOG-API.md.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const q = params.get("q") ?? undefined;
  const available = params.has("available") ? params.get("available") === "true" : undefined;
  const maxPriceRupees = params.has("max_price") ? Number(params.get("max_price")) : undefined;
  const minPriceRupees = params.has("min_price") ? Number(params.get("min_price")) : undefined;
  const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
  const offset = params.has("offset") ? Number(params.get("offset")) : undefined;

  if ([maxPriceRupees, minPriceRupees, limit, offset].some((n) => n !== undefined && Number.isNaN(n))) {
    return NextResponse.json(
      { error: "max_price, min_price, limit, and offset must be numbers." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { products, total } = await listCatalogProducts({
    q,
    available,
    maxPriceRupees,
    minPriceRupees,
    limit,
    offset,
  });

  return NextResponse.json({ products, total }, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

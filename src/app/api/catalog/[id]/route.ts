import { NextResponse } from "next/server";

import { getCatalogProduct } from "@/backend/lib/services/catalog";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getCatalogProduct(id);

  if (!product) {
    return NextResponse.json(
      { error: `No product found with product_id "${id}".` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(product, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

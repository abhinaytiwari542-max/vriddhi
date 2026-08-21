import { NextResponse } from "next/server";

import { processRazorpayWebhook } from "@/backend/lib/razorpay/webhook";

// ---------------------------------------------------------------------------
// Real Razorpay webhook endpoint — Phase 26. All verification and
// reconciliation logic lives in processRazorpayWebhook() (shared with the
// "simulate customer payment" demo action) — this route is just the HTTP
// boundary: read the raw body (the signature is computed over these exact
// bytes, never the parsed JSON), read the signature header, hand off.
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  const { httpStatus, body } = await processRazorpayWebhook(rawBody, signature);
  return NextResponse.json(body, { status: httpStatus });
}
